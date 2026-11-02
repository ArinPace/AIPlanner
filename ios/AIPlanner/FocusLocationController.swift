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
    private var latestGPSObservation = Date.distantPast
    private var expiryTask: Task<Void, Never>?
    private var familyAuthorization: AnyCancellable?
    private var currentPlaceRequest: ((FocusPlace?) -> Void)?
    var activeSession: Bool { defaults.double(forKey: "focusEnd") > Date().timeIntervalSince1970 }
    var backgroundAuthorized: Bool { manager.authorizationStatus == .authorizedAlways && CLLocationManager.locationServicesEnabled() }

    private override init() {
        super.init()
        enabled = defaults.bool(forKey: "focusLocationEnabled")
        preciseTracking = defaults.object(forKey: "focusPreciseTracking") == nil || defaults.bool(forKey: "focusPreciseTracking")
        if let data = defaults.data(forKey: "focusPlace"), let saved = try? JSONDecoder().decode(FocusPlace.self, from: data), saved.isValid { place = saved }
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
    func setPreciseTracking(_ value: Bool) {
        guard !activeSession else { return }
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
        currentPlaceRequest = completion; locating = true; error = nil
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        default: completeCurrentPlace(nil); error = "Allow location access in Settings to use your current location."
        }
    }
    func cancelCurrentPlaceRequest() { currentPlaceRequest = nil; locating = false }
    private func completeCurrentPlace(_ value: FocusPlace?) {
        let completion = currentPlaceRequest
        currentPlaceRequest = nil; locating = false; completion?(value)
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
        guard manager.accuracyAuthorization == .fullAccuracy else { return "Turn on Precise Location in Settings before starting a location-based session." }
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
        latestGPSObservation = .distantPast
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
            manager.startUpdatingLocation()
        } else { manager.requestLocation() } // Also resolves sessions started while already inside.
    }
    func refreshPosition() {
        authorization = manager.authorizationStatus
        precise = manager.accuracyAuthorization == .fullAccuracy
        guard activeSession, enabled else { finishIfExpired(); return }
        guard validationError() == nil else { error = validationError(); finishMonitoring(); setInside(nil, force: true); return }
        if !armed { arm() }
        else if let region {
            manager.requestState(for: region)
            if preciseTracking { manager.startUpdatingLocation() } else { manager.requestLocation() }
        }
    }
    func finishIfExpired() {
        if armed && !activeSession { finishMonitoring() }
    }
    func finishMonitoring() {
        expiryTask?.cancel(); expiryTask = nil
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
        let store = ManagedSettingsStore(named: .init("plannerFocus"))
        record("Focus eligibility: active=\(activeSession), enabled=\(enabled), validation=\(validationError() ?? "ok"), inside=\(String(describing: inside))")
        guard activeSession, (!enabled || (validationError() == nil && inside == true)),
              AuthorizationCenter.shared.authorizationStatus == .approved,
              let data = defaults.data(forKey: "focusSelection"),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            store.clearAllSettings(); return
        }
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        // The monitor extension can expire the session concurrently.
        if !activeSession { store.clearAllSettings() }
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
        if (!preciseTracking || Date().timeIntervalSince(latestGPSObservation) > 30) && (state != .unknown || inside == nil) { setInside(state == .unknown ? nil : state == .inside) }
    }
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard matchesCurrentPlace(region) else { return }
        guard activeSession else { finishMonitoring(); reconcileShields(); return }
        if !preciseTracking || Date().timeIntervalSince(latestGPSObservation) > 30 { error = nil; setInside(true) }
    }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard matchesCurrentPlace(region) else { return }
        if !preciseTracking || Date().timeIntervalSince(latestGPSObservation) > 30 { error = nil; setInside(false) }; finishIfExpired()
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) < 60 else { return }
        let accuracy = ceil(location.horizontalAccuracy)
        if reportedAccuracy != accuracy { reportedAccuracy = accuracy }
        latestGPSObservation = location.timestamp
        if armed && !activeSession { finishMonitoring(); reconcileShields(); return }
        if locating {
            completeCurrentPlace(FocusPlace(name: "Current location", latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, radius: 100))
        }
        guard armed, activeSession, enabled, let place else { return }
        let distance = location.distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude))
        // A coarse fix must not mark the phone inside a small boundary.
        if distance + location.horizontalAccuracy <= place.radius { error = nil; setInside(true) }
        else if distance - location.horizontalAccuracy > place.radius { error = nil; setInside(false) }
        else { error = nil; setInside(nil) }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard locating || (enabled && activeSession) else { return }
        if locating { completeCurrentPlace(nil) }
        record("Location lookup failed: \((error as NSError).code)")
        self.error = "Could not determine your location. Try again with Location Services enabled."
        if enabled && activeSession { setInside(nil, force: true) }
    }
    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        guard region == nil || region?.identifier == Self.regionID else { return }
        self.error = "Could not monitor this location. Apps are unblocked; open Planner to try again."
        finishMonitoring(); setInside(nil, force: true)
    }
}
