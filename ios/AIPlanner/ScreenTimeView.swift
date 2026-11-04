import SwiftUI
import FamilyControls
import ManagedSettings
import DeviceActivity
import Security

@MainActor final class ScreenTimeModel: ObservableObject {
    @Published var selection = FamilyActivitySelection(includeEntireCategory: true)
    @Published var end: Date?
    @Published var error: String?
    @Published var authorizing = false
    #if DEBUG
    @Published var monitorEndedAt: Double = 0
    #endif
    @Published var authorized = AuthorizationCenter.shared.authorizationStatus == .approved
    let defaults = UserDefaults(suiteName: "group.com.arinpace.aiplanner")!
    let store = ManagedSettingsStore(named: .init("plannerFocus"))
    let activity = DeviceActivityName("plannerFocus")
    init() {
        if let data = defaults.data(forKey: "focusSelection"), let saved = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
            var restored = FamilyActivitySelection(includeEntireCategory: true)
            restored.applicationTokens = saved.applicationTokens
            restored.categoryTokens = saved.categoryTokens
            restored.webDomainTokens = saved.webDomainTokens
            selection = restored
        }
        refresh()
    }
    func refresh() {
        #if DEBUG
        let marker = defaults.double(forKey: "focusMonitorEndedAt")
        if monitorEndedAt != marker { monitorEndedAt = marker }
        #endif
        let status = AuthorizationCenter.shared.authorizationStatus
        let approved = status == .approved
        if authorized != approved { authorized = approved }
        FocusLocationController.shared.finishIfExpired()
        let saved = defaults.double(forKey: "focusEnd")
        // Authorization initially loads as notDetermined on app launch.
        // Do not treat that transient value as revoked permission.
        if saved > 0 && (saved <= Date().timeIntervalSince1970 || status == .denied) {
            stop()
        } else {
            let restored = saved > 0 ? Date(timeIntervalSince1970: saved) : nil
            if end != restored { end = restored }
        }
    }
    @discardableResult
    func authorize() async -> Bool {
        guard !authorizing else { return false }
        authorizing = true
        defer { authorizing = false }
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            error = nil
            refresh()
            return authorized
        }
        catch { self.error = error.localizedDescription; return false }
    }
    func start(minutes: Int) {
        guard authorized else { error = "Allow Screen Time access first."; return }
        guard !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty else { error = "Choose apps to block first."; return }
        guard end == nil else { error = "End the current session before starting another."; return }
        guard (15...720).contains(minutes) else { error = "Choose between 15 minutes and 12 hours."; return }
        if let locationError = FocusLocationController.shared.validationError() { error = locationError; return }
        // Align the persisted deadline with DeviceActivity's whole-second schedule.
        let now = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970))
        let until = now.addingTimeInterval(Double(minutes) * 60 + 1)
        let calendar = Calendar.current
        let fields: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        do {
            let encodedSelection = try JSONEncoder().encode(selection)
            let schedule = DeviceActivitySchedule(intervalStart: calendar.dateComponents(fields, from: now), intervalEnd: calendar.dateComponents(fields, from: until), repeats: false)
            try DeviceActivityCenter().startMonitoring(activity, during: schedule)
            defaults.set(encodedSelection, forKey: "focusSelection")
            defaults.set(until.timeIntervalSince1970, forKey: "focusEnd")
            if FocusLocationController.shared.enabled { FocusLocationController.shared.arm() }
            else { FocusLocationController.shared.reconcileShields() }
            #if DEBUG && targetEnvironment(simulator)
            if ProcessInfo.processInfo.arguments.contains("-UITestShieldAll") {
                store.shield.applicationCategories = .all(except: [])
            }
            if ProcessInfo.processInfo.arguments.contains("-UITestShieldAll") || ProcessInfo.processInfo.arguments.contains("-UITestPolicyRecovery") {
                // Bound OS-enforcement diagnostics to 30 seconds, including background time.
                let task = UIApplication.shared.beginBackgroundTask(withName: "Screen Time diagnostic") { [weak self] in self?.stop() }
                DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                    self.stop()
                    if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
                }
            }
            #endif
            end = until; error = nil
        } catch { self.error = error.localizedDescription }
    }
    func saveSelection() {
        if let data = try? JSONEncoder().encode(selection) { defaults.set(data, forKey: "focusSelection") }
        error = nil
    }
    func stop() {
        FocusLocationController.shared.finishMonitoring()
        store.clearAllSettings()
        defaults.removeObject(forKey: "focusEnd")
        DeviceActivityCenter().stopMonitoring([activity])
        end = nil; error = nil
    }
}

struct ScreenTimeView: View {
    @StateObject private var model = ScreenTimeModel()
    @ObservedObject private var location = FocusLocationController.shared
    @State private var choosingLocation = false
    @Environment(\.scenePhase) private var phase
    @State private var picker = false
    @State private var minutes = 30
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Choose distracting apps and block them for a focus session.")
                }
                if !model.authorized {
                    Section { Button("Allow Screen Time access") { Task { await model.authorize() } }.disabled(model.authorizing) }
                }
                NextDNSSection(account: WidgetTaskControl.defaults.string(forKey: "feedback-account") ?? "")
                Section("Apps to block") {
                    Button("Choose apps") {
                        Task { if await model.authorize() { picker = true } }
                    }.disabled(model.authorizing || model.end != nil)
                    Text("\(model.selection.applicationTokens.count) apps · \(model.selection.categoryTokens.count) categories · \(model.selection.webDomainTokens.count) websites").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Location (optional)") {
                    Toggle("Use location rules", isOn: Binding(get: { location.enabled }, set: { location.setEnabled($0) }))
                        .disabled(model.end != nil)
                    if location.enabled {
                        Picker("Location rule", selection: Binding(get: { location.rule }, set: { location.setRule($0) })) {
                            ForEach(FocusLocationRule.allCases, id: \.self) { rule in Text(rule.title).tag(rule) }
                        }.pickerStyle(.segmented).disabled(model.end != nil)
                        Text(location.rule == .allowInside ? "Selected apps are blocked everywhere else. Access at this place expires unless your precise location is reverified." : "Selected apps are blocked only at this place.").font(.footnote).foregroundStyle(.secondary)
                        Button(location.place?.name ?? "Choose location") { choosingLocation = true }.accessibilityIdentifier("chooseFocusLocation").disabled(model.end != nil)
                        if let place = location.place {
                            Text(String(format: "Saved location: %.4f, %.4f", place.latitude, place.longitude)).font(.caption).foregroundStyle(.secondary)
                            Picker("Radius", selection: Binding(get: { place.radius }, set: { location.setRadius($0) })) {
                                ForEach([50.0, 100, 200, 500, 1000], id: \.self) { radius in Text("\(Int(radius)) m").tag(radius) }
                            }.disabled(model.end != nil)
                            Toggle("Periodic precise checks", isOn: Binding(get: { location.preciseTracking }, set: { location.setPreciseTracking($0) })).disabled(model.end != nil || location.rule == .allowInside)
                            if location.preciseTracking {
                                Picker("Verify location", selection: Binding(get: { location.checkInterval }, set: { location.setCheckInterval($0) })) {
                                    ForEach([120.0,180,300,600], id: \.self) { seconds in Text("Every \(Int(seconds / 60)) minutes").tag(seconds) }
                                }.disabled(model.end != nil)
                            }
                            Text(location.preciseTracking ? "Brief high-accuracy checks with lower-power monitoring between them. iOS may delay background checks; expired location access is restricted." : "Low-power area monitoring; notifications may be less precise and delayed.").font(.footnote).foregroundStyle(.secondary)
                            if location.checking { Text("Verifying precise location…").font(.footnote) }
                            if let date = location.lastVerifiedAt { Text("Last precise check: \(date.formatted(date: .omitted, time: .standard))").font(.footnote).accessibilityIdentifier("focusLastVerified") }
                            if let accuracy = location.reportedAccuracy {
                                Text("Last reported accuracy: ±\(Int(ceil(accuracy))) m").font(.footnote).foregroundStyle(.secondary)
                            }
                            Text("Saved place stays on this device. Location boundaries are approximate.").font(.footnote).foregroundStyle(.secondary)
                        }
                        if !location.backgroundAuthorized || !location.precise {
                            if !location.backgroundAuthorized { Button("Allow location in background") { location.requestBackgroundAccess() } }
                            Text("Keep Always access, Precise Location and Background App Refresh enabled so blocking can turn off when you leave with Planner closed.").font(.footnote).foregroundStyle(.secondary)
                            Button("Open location settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                        }
                        if model.end != nil {
                            Text(location.statusText)
                                .accessibilityIdentifier("focusLocationStatus")
                            Text("The session timer keeps running while you are away. Location changes may take a little time to register.").font(.footnote).foregroundStyle(.secondary)
                        }
                        if let error = location.error {
                            Text(error).foregroundStyle(.red)
                            if model.end != nil { Button("Check location again") { location.refreshPosition() } }
                        }
                    }
                }
                if let end = model.end {
                    Section("Focus session") {
                        Text(end, style: .timer).font(.largeTitle).monospacedDigit()
                        Text("Ends at \(end.formatted(date: .omitted, time: .shortened))")
                        Button("End blocking", role: .destructive) { model.stop() }
                    }
                } else {
                    Section("Duration") {
                        Stepper("\(minutes) minutes", value: $minutes, in: 15...720, step: 15)
                        Button("Start blocking") { model.start(minutes: minutes) }.disabled(!model.authorized)
                    }
                }
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-UITestPeriodicLocation") {
                    Text(String(FocusShieldRules.defaults.double(forKey: "focusBackgroundVerificationAt"))).accessibilityIdentifier("focusBackgroundVerification")
                }
                if ProcessInfo.processInfo.arguments.contains("-UITestShortLocationLease") {
                    Text(String(FocusShieldRules.defaults.double(forKey: "focusLocationLeaseExpiredAt"))).accessibilityIdentifier("focusLeaseExpiry")
                }
                if ProcessInfo.processInfo.arguments.contains("-UITestFocusExpiry") {
                    Text(String(model.monitorEndedAt))
                        .accessibilityIdentifier("focusMonitorExpiry")
                }
                #endif
                if let error = model.error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("Screen Time")
            .familyActivityPicker(isPresented: $picker, selection: $model.selection)
            .sheet(isPresented: $choosingLocation) { FocusLocationPicker(location: location) }
        }
        .onChange(of: model.selection) { _, _ in model.saveSelection() }
        .task(id: picker) {
            guard !picker else { return }
            while !Task.isCancelled {
                model.refresh()
                try? await Task.sleep(for: .seconds(1))
            }
        }
        .onChange(of: phase) { _, value in if value == .active { model.refresh(); location.refreshPosition() } }
    }
}

#if DEBUG && targetEnvironment(simulator)
/// Minimal Apple API reproduction, without Planner's web view, storage or polling.
struct StandaloneScreenTimePickerProbe: View {
    @State private var selection = FamilyActivitySelection()
    @State private var presented = false
    @State private var error = ""
    var body: some View {
        VStack {
            Button("Choose apps") {
                Task {
                    do {
                        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                        presented = true
                    } catch { self.error = error.localizedDescription }
                }
            }
            Text(error)
        }
        .familyActivityPicker(isPresented: $presented, selection: $selection)
    }
}
#endif

struct TaskScreenTimeView: View {
    let account: String
    let task: TaskFocusWindow
    @StateObject private var authorization = ScreenTimeModel()
    @State private var selection: FamilyActivitySelection
    @State private var picker = false
    @State private var error: String?
    @State private var now = Date()
    @Environment(\.dismiss) private var dismiss
    init(account: String, task: TaskFocusWindow) {
        self.account = account; self.task = task
        var saved = FamilyActivitySelection(includeEntireCategory: true)
        if let record = TaskFocusRules.record(account: account, window: task) {
            saved.applicationTokens = record.selection.applicationTokens
            saved.categoryTokens = record.selection.categoryTokens
            saved.webDomainTokens = record.selection.webDomainTokens
        }
        _selection = State(initialValue: saved)
    }
    private var configured: TaskFocusRecord? { TaskFocusRules.record(account: account, window: task) }
    private var ended: Bool { task.end <= now.timeIntervalSince1970 }
    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    Text(task.title).font(.headline)
                    LabeledContent("Starts", value: Date(timeIntervalSince1970: task.start).formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Ends", value: Date(timeIntervalSince1970: task.end).formatted(date: .abbreviated, time: .shortened))
                    Text(ended ? "This task has ended." : task.start > now.timeIntervalSince1970 ? "Blocking starts automatically when this task begins." : "Blocking starts now and ends with this task.").font(.footnote).foregroundStyle(.secondary)
                }
                if !authorization.authorized {
                    Section { Button("Allow Screen Time access") { Task { await authorization.authorize() } }.disabled(authorization.authorizing) }
                }
                NextDNSSection(account: account)
                Section("Apps to block for this task") {
                    Button("Choose apps") { Task { if await authorization.authorize() { picker = true } } }.disabled(authorization.authorizing || ended)
                    Text("\(selection.applicationTokens.count) apps · \(selection.categoryTokens.count) categories · \(selection.webDomainTokens.count) websites").font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Button(configured == nil ? (task.start > now.timeIntervalSince1970 ? "Schedule task blocking" : "Block for this task") : "Update task blocking") {
                        do {
                            var testAll = false
                            #if DEBUG && targetEnvironment(simulator)
                            testAll = ProcessInfo.processInfo.arguments.contains("-UITestTaskFocusAll")
                            #endif
                            try TaskFocusRules.save(account: account, window: task, selection: selection, testAllApps: testAll)
                            error = nil; now = Date()
                        } catch { self.error = error.localizedDescription }
                    }.disabled(!authorization.authorized || ended)
                    if let record = configured {
                        Text(record.window.start > now.timeIntervalSince1970 ? "Scheduled for this task" : "Task blocking is active").accessibilityIdentifier("taskBlockingStatus")
                        Button("Remove task blocking", role: .destructive) { TaskFocusRules.remove(record.name); now = Date() }
                    }
                    Text("Applies to this occurrence only. Timing changes follow your calendar when Planner syncs. App choices stay on this device.").font(.footnote).foregroundStyle(.secondary)
                }
                if let message = error ?? authorization.error { Section { Text(message).foregroundStyle(.red) } }
            }
            .navigationTitle("Task Screen Time")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .familyActivityPicker(isPresented: $picker, selection: $selection)
        }
        .task(id: picker) {
            guard !picker else { return }
            while !Task.isCancelled {
                authorization.refresh(); TaskFocusRules.refreshAll(); now = Date()
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }
}

// Keys stay in the device Keychain, isolated by Planner account. No cloud proxy.
private enum NextDNSCredentials {
    static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.arinpace.aiplanner.nextdns", kSecAttrAccount as String: account]
    }
    static func load(_ account: String) -> String {
        var q = query(account); q[kSecReturnData as String] = true
        var value: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess, let data = value as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    static func save(_ key: String, account: String) throws {
        let q = query(account)
        if key.isEmpty { SecItemDelete(q as CFDictionary); return }
        let attributes: [String: Any] = [kSecValueData as String: Data(key.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw NSError(domain: "NextDNS Keychain", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Could not save the NextDNS key securely."]) }
    }
}
private struct NextDNSSection: View {
    let account: String
    @State private var showing = false
    var body: some View {
        Section("Website blocking (optional)") {
            Button("NextDNS website blocking") { showing = true }.disabled(account.isEmpty)
            Text("Block domains using your NextDNS profile, alongside Apple Screen Time.").font(.footnote).foregroundStyle(.secondary)
        }.sheet(isPresented: $showing) { NextDNSSettings(account: account).id(account) }
    }
}
private struct NextDNSSettings: View {
    let account: String
    @Environment(\.dismiss) private var dismiss
    @State private var profile = ""
    @State private var key = ""
    @State private var domain = ""
    @State private var domains: [String] = []
    @State private var busy = false
    @State private var message: String?
    private var profileKey: String { "nextdns-profile:" + account }
    var body: some View {
        NavigationStack {
            Form {
                Section("Connect NextDNS") {
                    TextField("Configuration ID (6 characters)", text: $profile).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("NextDNS API key", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Link("Find your API key", destination: URL(string: "https://my.nextdns.io/account")!)
                    Button("Save and check connection") { run { _ = try await call(); try NextDNSCredentials.save(key, account: account); UserDefaults.standard.set(profile, forKey: profileKey); message = "API connected. Check device DNS separately below." } }
                    Button("Forget connection", role: .destructive) { run { try NextDNSCredentials.save("", account: account); UserDefaults.standard.removeObject(forKey: profileKey); key = ""; profile = ""; domains = []; message = "Forgot connection. Existing NextDNS rules and installed DNS profile remain unchanged." } }
                }
                Section("Set up this iPhone") {
                    Link("Install a NextDNS DNS profile", destination: URL(string: "https://apple.nextdns.io")!)
                    Link("Check which DNS this device uses", destination: URL(string: "https://test.nextdns.io")!)
                    Text("Install a profile with the same configuration ID. An API connection alone does not enable filtering. VPNs or other DNS settings can affect coverage.").font(.footnote)
                }
                Section("Blocked domains") {
                    TextField("example.com", text: $domain).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    Button("Block domain") { run {
                        let value = domain.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                        guard value.range(of: #"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"#, options: .regularExpression) != nil else { throw failure("Enter a domain such as example.com, without a URL path.") }
                        _ = try await call(method: "POST", payload: ["id": value, "active": true]); domain = ""; try await refresh()
                    } }
                    Button("Refresh blocked domains") { run { try await refresh() } }
                    ForEach(domains, id: \.self) { name in
                        HStack { Text(name); Spacer(); Button("Unblock") { run { _ = try await call(suffix: "/" + name, method: "DELETE"); try await refresh() } } }
                    }
                    Text("Changes affect every device using this configuration. Use a dedicated profile for this iPhone. These rules persist until unblocked; task timers and location rules do not automatically change NextDNS. DNS blocks domains, not individual pages, and cached connections may take time to stop.").font(.footnote).foregroundStyle(.secondary)
                }
                if busy { ProgressView() }
                if let message { Section { Text(message).textSelection(.enabled) } }
            }.disabled(busy)
            .navigationTitle("NextDNS")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.disabled(busy) } }
        }.onAppear { profile = UserDefaults.standard.string(forKey: profileKey) ?? ""; key = NextDNSCredentials.load(account) }
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "NextDNS", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    private func run(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }; busy = true; message = nil
        Task { defer { busy = false }; do { try await operation() } catch { message = error.localizedDescription } }
    }
    private func call(suffix: String = "", cursor: String? = nil, method: String = "GET", payload: [String: Any]? = nil) async throws -> [String: Any] {
        guard profile.range(of: #"^[a-fA-F0-9]{6}$"#, options: .regularExpression) != nil, !key.isEmpty else { throw failure("Enter a valid configuration ID and API key.") }
        var components = URLComponents(string: "https://api.nextdns.io/profiles/" + profile + "/denylist" + suffix)!
        if let cursor { components.queryItems = [URLQueryItem(name: "cursor", value: cursor)] }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method; request.timeoutInterval = 25
        request.setValue(key, forHTTPHeaderField: "X-Api-Key")
        if let payload { request.httpBody = try JSONSerialization.data(withJSONObject: payload); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw failure("NextDNS request failed. Check the key, configuration ID and connection.") }
        let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let errors = result["errors"] as? [Any], !errors.isEmpty { throw failure("NextDNS rejected the change. Check the domain and profile permissions.") }
        return result
    }
    private func refresh() async throws {
        var cursor: String?; var loaded: [String] = []; var seen = Set<String>()
        repeat {
            let result = try await call(cursor: cursor)
            loaded += ((result["data"] as? [[String: Any]]) ?? []).filter { $0["active"] as? Bool != false }.compactMap { $0["id"] as? String }
            cursor = ((result["meta"] as? [String: Any])?["pagination"] as? [String: Any])?["cursor"] as? String
            if let cursor, !seen.insert(cursor).inserted { throw failure("NextDNS pagination failed. Try refreshing again.") }
        } while cursor != nil
        domains = Array(Set(loaded)).sorted()
        message = "Loaded blocked domains. Device filtering must be checked separately."
    }
}
