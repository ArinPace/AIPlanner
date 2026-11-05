import CoreLocation
import FamilyControls
import ManagedSettings
import Combine
import UIKit
import OSLog

struct FocusPlace: Codable, Equatable {
    var name: String
    var latitude: Double
    var longitude: Double
    var radius: Double
    var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
    var isValid: Bool {
        CLLocationCoordinate2DIsValid(coordinate) && latitude.isFinite && longitude.isFinite && radius.isFinite && (50...1000).contains(radius)
    }
}

/// One app-wide delegate survives closing the Screen Time tab and handles region wakeups.
@MainActor final class FocusLocationController: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    static let shared = FocusLocationController()
    static let regionID = "plannerFocusLocation"
    private let defaults = UserDefaults(suiteName: "group.com.arinpace.aiplanner")!
    private let manager = CLLocationManager()
    @Published private(set) var enabled = false
    @Published private(set) var place: FocusPlace?
    @Published private(set) var inside: Bool?
    @Published private(set) var preciseTracking = true
    @Published private(set) var rule: FocusLocationRule = .allowInside
    @Published private(set) var checkInterval: Double = 180
    @Published private(set) var checking = false
    @Published private(set) var lastVerifiedAt: Date?
    @Published private(set) var reportedAccuracy: Double?
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var precise = true
    @Published private(set) var error: String?
    @Published private(set) var locating = false
    private func record(_ message: String) {
        #if DEBUG
        Logger(subsystem: "com.arinpace.aiplanner", category: "focusLocation").notice("\(message, privacy: .public)")
        #endif
    }
    private var armed = false
    private var expiryTask: Task<Void, Never>?
    private var familyAuthorization: AnyCancellable?
    private var checkTask: Task<Void, Never>?
    private var burstTask: Task<Void, Never>?
    private var burstStartedAt: Date?
    private var currentPlaceTimeout: Task<Void, Never>?
    private var currentPlaceRetry: Task<Void, Never>?
    private var currentPlaceAttempts = 0
    private var currentPlaceRequest: ((FocusPlace?) -> Void)?
    var activeSession: Bool { defaults.double(forKey: "focusEnd") > Date().timeIntervalSince1970 }
    var backgroundAuthorized: Bool { authorization == .authorizedAlways }

    private override init() {
        super.init()
        enabled = defaults.bool(forKey: "focusLocationEnabled")
        preciseTracking = defaults.object(forKey: "focusPreciseTracking") == nil || defaults.bool(forKey: "focusPreciseTracking")
        if let data = defaults.data(forKey: "focusPlace"), let saved = try? JSONDecoder().decode(FocusPlace.self, from: data), saved.isValid { place = saved }
        rule = FocusLocationRule(rawValue: defaults.string(forKey: "focusLocationRule") ?? "") ?? (place == nil ? .allowInside : .blockInside)
        defaults.set(rule.rawValue, forKey: "focusLocationRule")
        if [120.0,180,300,600].contains(defaults.double(forKey: "focusLocationCheckInterval")) { checkInterval = defaults.double(forKey: "focusLocationCheckInterval") }
        if rule == .allowInside { preciseTracking = true }
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
        authorization = manager.authorizationStatus
        precise = manager.accuracyAuthorization == .fullAccuracy
        familyAuthorization = AuthorizationCenter.shared.$authorizationStatus.sink { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.enabled, self.activeSession else { return }
                self.reconcileShields()
            }
        }
    }
    func setEnabled(_ value: Bool) {
        guard !activeSession else { return }
        enabled = value; defaults.set(value, forKey: "focusLocationEnabled"); error = nil
    }
    func setRule(_ value: FocusLocationRule) {
        guard !activeSession else { return }
        rule = value; defaults.set(value.rawValue, forKey: "focusLocationRule")
        if value == .allowInside { setPreciseTracking(true) }
    }
    func setCheckInterval(_ value: Double) {
        guard !activeSession, [120.0,180,300,600].contains(value) else { return }
        checkInterval = value; defaults.set(value, forKey: "focusLocationCheckInterval")
    }
    private var verificationInterval: Double {
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("-UITestShortLocationLease") { return 30 }
        #endif
        return checkInterval
    }
    func setPreciseTracking(_ value: Bool) {
        guard !activeSession, value || rule != .allowInside else { return }
        preciseTracking = value; defaults.set(value, forKey: "focusPreciseTracking")
    }
    func setPlace(_ value: FocusPlace) {
        guard !activeSession, value.isValid else { return }
        place = value
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: "focusPlace") }
        error = nil
    }
    func setRadius(_ radius: Double) {
        guard var value = place else { return }
        value.radius = radius; setPlace(value)
    }
    func requestBackgroundAccess() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse: manager.requestAlwaysAuthorization()
        case .denied, .restricted: error = "Location access is off. Open Settings to allow location access."
        default: break
        }
    }
    func useCurrentPlace(_ completion: @escaping (FocusPlace?) -> Void) {
        guard !locating else { return }
        currentPlaceRequest = completion; locating = true; error = nil; currentPlaceAttempts = 0
        currentPlaceTimeout = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(20))
            guard !Task.isCancelled, let self, self.locating else { return }
            self.error = Self.currentPlaceUnavailable
            self.completeCurrentPlace(nil)
        }
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        default: completeCurrentPlace(nil); error = "Allow location access in Settings to use your current location."
        }
    }
    private static var currentPlaceUnavailable: String {
        #if targetEnvironment(simulator)
        return "No simulated location is available. Choose a location in Simulator’s Features → Location menu, or search for an address above."
        #else
        return "Couldn’t get a GPS fix. Try again, or search for an address above."
        #endif
    }
    func clearPlaceLookupError() { if !locating { error = nil } }
    func cancelCurrentPlaceRequest() {
        currentPlaceTimeout?.cancel(); currentPlaceTimeout = nil
        currentPlaceRetry?.cancel(); currentPlaceRetry = nil
        currentPlaceRequest = nil; locating = false
    }
    private func completeCurrentPlace(_ value: FocusPlace?) {
        let completion = currentPlaceRequest
        cancelCurrentPlaceRequest()
        if value != nil { error = nil }
        completion?(value)
    }
    private var region: CLCircularRegion? {
        guard let place, place.isValid, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self), manager.maximumRegionMonitoringDistance >= place.radius else { return nil }
        let region = CLCircularRegion(center: place.coordinate, radius: place.radius, identifier: Self.regionID)
        region.notifyOnEntry = true; region.notifyOnExit = true
        return region
    }
    func validationError() -> String? {
        guard enabled else { return nil }
        guard place?.isValid == true else { return "Choose a location first." }
        guard backgroundAuthorized else { return "Allow Always location access before starting a location-based session." }
        guard precise else { return "Turn on Precise Location in Settings before starting a location-based session." }
        guard UIApplication.shared.backgroundRefreshStatus == .available else { return "Enable Background App Refresh in Settings for location-based blocking." }
        guard region != nil else { return "Location boundaries are unavailable on this device." }
        return nil
    }
    /// Called at app launch, including a launch for a Core Location event.
    func resume() {
        guard activeSession else { finishMonitoring(); reconcileShields(); return }
        guard enabled else { finishMonitoring(); return }
        arm()
    }
    func arm() {
        guard activeSession, enabled, validationError() == nil, let region else {
            if enabled { setInside(nil, force: true); error = validationError() }
            return
        }
        armed = true; error = nil
        expiryTask?.cancel()
        let remaining = max(0, defaults.double(forKey: "focusEnd") - Date().timeIntervalSince1970)
        expiryTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(remaining)) } catch { return }
            guard !Task.isCancelled, let self, !self.activeSession else { return }
            self.finishMonitoring(); self.reconcileShields()
        }
        setInside(nil, force: true) // Never apply a saved inside-state without checking the device again.
        manager.startMonitoring(for: region)
        manager.requestState(for: region)
        if preciseTracking {
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
            manager.pausesLocationUpdatesAutomatically = false
            beginPreciseCheck()
        } else { manager.requestLocation() }
    }
    func refreshPosition() {
        authorization = manager.authorizationStatus
        precise = manager.accuracyAuthorization == .fullAccuracy
        guard activeSession, enabled else { finishIfExpired(); return }
        guard validationError() == nil else { error = validationError(); finishMonitoring(); setInside(nil, force: true); return }
        if !armed { arm() }
        else if let region {
            manager.requestState(for: region)
            if preciseTracking { beginPreciseCheck() } else { manager.requestLocation() }
        }
    }
    func finishIfExpired() {
        if armed && !activeSession { finishMonitoring() }
        else if armed && preciseTracking && inside != nil && defaults.double(forKey: "focusLocationVerifiedUntil") <= Date().timeIntervalSince1970 {
            setInside(nil, force: true)
        }
    }
    var effectiveInside: Bool? {
        guard validationError() == nil else { return nil }
        if preciseTracking && defaults.double(forKey: "focusLocationVerifiedUntil") <= Date().timeIntervalSince1970 { return nil }
        return inside
    }
    var statusText: String {
        if rule == .allowInside {
            return effectiveInside == true ? "At allowed location · apps available" : effectiveInside == false ? "Outside allowed location · apps blocked" : "Verifying location · apps blocked"
        }
        return effectiveInside == true ? "Blocking at selected location" : effectiveInside == false ? "Outside selected location · apps unblocked" : "Checking location · apps unblocked"
    }
    private func scheduleNextCheck(after seconds: Double) {
        checkTask?.cancel()
        checkTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(max(1,seconds))) } catch { return }
            guard !Task.isCancelled, let self, self.armed, self.activeSession else { return }
            self.beginPreciseCheck()
        }
    }
    private func beginPreciseCheck() {
        guard armed, activeSession, preciseTracking, !checking else { return }
        checking = true; error = nil; burstStartedAt = Date()
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.startUpdatingLocation()
        burstTask?.cancel()
        burstTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(20)) } catch { return }
            guard !Task.isCancelled, let self, self.checking else { return }
            self.setInside(nil, force: true)
            self.error = self.rule == .allowInside ? "Could not verify your location. Apps remain blocked." : "Could not verify your location. Apps are unblocked until the location is confirmed."
            self.endPreciseCheck()
        }
    }
    private func endPreciseCheck() {
        burstTask?.cancel(); burstTask = nil
        checking = false; burstStartedAt = nil
        guard armed, activeSession, preciseTracking else { return }
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.distanceFilter = 50
        manager.startUpdatingLocation()
        scheduleNextCheck(after: max(10,verificationInterval - 20))
    }
    private func confirmLocation(_ value: Bool) {
        let end = Date(timeIntervalSince1970: min(defaults.double(forKey: "focusEnd"), floor(Date().timeIntervalSince1970) + verificationInterval))
        do {
            try FocusShieldRules.registerVerification(until: end)
            lastVerifiedAt = Date()
            #if DEBUG && targetEnvironment(simulator)
            if ProcessInfo.processInfo.arguments.contains("-UITestPeriodicLocation"), UIApplication.shared.applicationState == .background {
                defaults.set(Date().timeIntervalSince1970, forKey: "focusBackgroundVerificationAt")
            }
            #endif
            setInside(value, force: true)
            endPreciseCheck()
        } catch {
            self.error = self.rule == .allowInside ? "Could not schedule verification. Apps remain blocked." : "Could not schedule location verification. Try again."
            setInside(nil, force: true)
            endPreciseCheck()
        }
    }
    func finishMonitoring() {
        expiryTask?.cancel(); expiryTask = nil
        checkTask?.cancel(); checkTask = nil
        burstTask?.cancel(); burstTask = nil
        checking = false; burstStartedAt = nil
        FocusShieldRules.cancelVerification()
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
        manager.pausesLocationUpdatesAutomatically = true
        for region in manager.monitoredRegions where region.identifier == Self.regionID { manager.stopMonitoring(for: region) }
        armed = false
        if inside != nil { inside = nil }
    }
    private func setInside(_ value: Bool?, force: Bool = false) {
        guard inside != value || force else { return }
        record("Location state: \(String(describing: value))")
        inside = value
        reconcileShields()
    }
    func reconcileShields() {
        let blocked = !enabled || rule.shouldBlock(inside: effectiveInside)
        record("Focus policy: active=\(activeSession), blocked=\(blocked)")
        FocusShieldRules.apply(blocked: blocked)
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        precise = manager.accuracyAuthorization == .fullAccuracy
        if locating {
            if authorization == .authorizedAlways || authorization == .authorizedWhenInUse { manager.requestLocation() }
            else if authorization == .denied || authorization == .restricted { completeCurrentPlace(nil); error = "Location access was not allowed." }
        }
        if enabled && activeSession {
            if validationError() == nil { arm() }
            else { finishMonitoring(); setInside(nil, force: true) }
        }
    }
    private func matchesCurrentPlace(_ region: CLRegion) -> Bool {
        guard armed, region.identifier == Self.regionID, let region = region as? CLCircularRegion, let place else { return false }
        return abs(region.center.latitude - place.latitude) < 0.00001 && abs(region.center.longitude - place.longitude) < 0.00001 && abs(region.radius - place.radius) < 1
    }
    func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) {
        guard matchesCurrentPlace(region) else { return }
        manager.requestState(for: region)
    }
    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        guard matchesCurrentPlace(region) else { return }
        guard activeSession else { finishMonitoring(); reconcileShields(); return }
        record("Region state callback: \(state.rawValue)")
        if preciseTracking {
            if lastVerifiedAt == nil || Date().timeIntervalSince(lastVerifiedAt!) > 15 { beginPreciseCheck() }
        }
        else if state != .unknown || inside == nil { setInside(state == .unknown ? nil : state == .inside) }
    }
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard matchesCurrentPlace(region) else { return }
        guard activeSession else { finishMonitoring(); reconcileShields(); return }
        if preciseTracking { beginPreciseCheck() } else { error = nil; setInside(true) }
    }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard matchesCurrentPlace(region) else { return }
        if preciseTracking { setInside(nil, force: true); beginPreciseCheck() } else { error = nil; setInside(false) }; finishIfExpired()
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) < 60 else { return }
        if armed && !activeSession { finishMonitoring(); reconcileShields(); return }
        if locating {
            reportedAccuracy = ceil(location.horizontalAccuracy)
            completeCurrentPlace(FocusPlace(name: "Current location", latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, radius: 100))
        }
        guard armed, activeSession, enabled, let place else { return }
        let distance = location.distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude))
        if preciseTracking {
            if checking {
                guard let began = burstStartedAt, location.timestamp >= began.addingTimeInterval(-2), location.horizontalAccuracy <= min(50, place.radius / 2) else { return }
                reportedAccuracy = ceil(location.horizontalAccuracy)
                if distance + location.horizontalAccuracy <= place.radius { confirmLocation(true) }
                else if distance - location.horizontalAccuracy > place.radius { confirmLocation(false) }
            } else if distance - location.horizontalAccuracy > place.radius && inside != false {
                setInside(false, force: true)
                beginPreciseCheck()
            }
        } else {
            reportedAccuracy = ceil(location.horizontalAccuracy)
            if distance + location.horizontalAccuracy <= place.radius { error = nil; setInside(true) }
            else if distance - location.horizontalAccuracy > place.radius { error = nil; setInside(false) }
            else { setInside(nil) }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard locating || (enabled && activeSession) else { return }
        if let failure = error as? CLError, failure.code == .locationUnknown, armed, preciseTracking { return }
        if locating, let failure = error as? CLError, failure.code == .locationUnknown, currentPlaceAttempts < 3 {
            currentPlaceAttempts += 1
            currentPlaceRetry?.cancel()
            currentPlaceRetry = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled, let self, self.locating else { return }
                self.manager.requestLocation()
            }
            return
        }
        let wasLocating = locating
        if locating { completeCurrentPlace(nil) }
        record("Location lookup failed: \((error as NSError).code)")
        self.error = wasLocating ? ((error as? CLError)?.code == .denied ? "Location access is off. Allow it in Settings, or search for an address above." : Self.currentPlaceUnavailable) : "Could not verify your location. Check Location Services and try again."
        if enabled && activeSession { setInside(nil, force: true); if preciseTracking { endPreciseCheck() } }
    }
    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        guard region == nil || region?.identifier == Self.regionID else { return }
        self.error = "Could not monitor this location. Apps are unblocked; open Planner to try again."
        finishMonitoring(); setInside(nil, force: true)
    }
}
