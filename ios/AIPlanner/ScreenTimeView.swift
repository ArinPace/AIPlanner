import SwiftUI
import FamilyControls
import ManagedSettings
import DeviceActivity
import Security
import CryptoKit

@MainActor final class ScreenTimeModel: ObservableObject {
    @Published var selection = FamilyActivitySelection(includeEntireCategory: true)
    @Published var policy = FocusBlockPolicy()
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
        if let data = defaults.data(forKey: "focusBlockPolicy"), let saved = try? JSONDecoder().decode(FocusBlockPolicy.self, from: data) { policy = saved }
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
    func start(minutes: Int, until absoluteEnd: Date? = nil) {
        guard authorized else { error = "Allow Screen Time access first."; return }
        guard policy.hasRules || !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty else { error = "Choose apps to block first."; return }
        guard end == nil else { error = "End the current session before starting another."; return }
        guard (15...720).contains(minutes) else { error = "Choose between 15 minutes and 12 hours."; return }
        if let locationError = FocusLocationController.shared.validationError() { error = locationError; return }
        // Align the persisted deadline with DeviceActivity's whole-second schedule.
        let now = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970))
        let until = absoluteEnd.map { Date(timeIntervalSince1970: floor($0.timeIntervalSince1970)) } ?? now.addingTimeInterval(Double(minutes) * 60 + 1)
        guard (900...43201).contains(until.timeIntervalSince(now)) else { error = "Choose an end between 15 minutes and 12 hours away.";return }
        let calendar = Calendar.current
        let fields: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        do {
            let encodedSelection = try JSONEncoder().encode(selection)
            let schedule = DeviceActivitySchedule(intervalStart: calendar.dateComponents(fields, from: now), intervalEnd: calendar.dateComponents(fields, from: until), repeats: false)
            try DeviceActivityCenter().startMonitoring(activity, during: schedule)
            defaults.set(encodedSelection, forKey: "focusSelection")
            defaults.set(try JSONEncoder().encode(policy), forKey: "focusBlockPolicy")
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
    var guided = false
    @State private var setupStep = 0
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = ScreenTimeModel()
    @ObservedObject private var location = FocusLocationController.shared
    @State private var choosingLocation = false
    @Environment(\.scenePhase) private var phase
    @State private var picker = false
    @State private var minutes = 30
    @State private var groups: [FocusAppGroup] = []
    @State private var groupName = ""
    @State private var groupSelection = FamilyActivitySelection(includeEntireCategory: true)
    @State private var groupPicker = false
    @State private var websites = ""
    @State private var allowedWebsites = ""
    private var account: String { WidgetTaskControl.defaults.string(forKey: "feedback-account") ?? "" }
    private let pickerRequest = NotificationCenter.default.publisher(for: Notification.Name("PlannerAgentChooseApps"))
    var body: some View {
        NavigationStack {
            Form {
                if guided {
                    Section {
                        Text("Step \(setupStep + 1) of 4").font(.subheadline).foregroundStyle(.secondary)
                        ProgressView(value: Double(setupStep + 1), total: 4).tint(.blue)
                        Text(["Allow Screen Time", "Create your app groups", "Choose a location", "You’re ready"][setupStep]).font(.title2.bold())
                        Text(["Give Planner permission to block distractions. You stay in control of which apps are included.", "Save groups such as Social media, Photos & video, or Games. Your agent can block each group separately.", "Optionally allow apps only at a place, or block them when you arrive. You can skip this step.", "Your agent can now use your saved groups during tasks. Website rules need no additional setup."][setupStep]).foregroundStyle(.secondary)
                    }
                }
                if (!guided || setupStep == 0) && !model.authorized {
                    Section { Button("Allow Screen Time access") { Task { await model.authorize() } }.disabled(model.authorizing) }
                }
                if guided && setupStep == 0 && model.authorized { Section { Label("Screen Time access allowed", systemImage: "checkmark.circle.fill").foregroundStyle(.green) } }
                if !guided || setupStep == 1 {
                Section("App groups") {
                    if guided {
                        HStack {
                            ForEach(["Social media", "Photos & video", "Games"], id: \.self) { name in
                                Button(name) { groupName = name }.buttonStyle(.bordered).font(.caption)
                            }
                        }
                    }
                    TextField("Group name (e.g. Social media)", text: $groupName)
                    Button("Choose apps for new group") {
                        groupSelection = FamilyActivitySelection(includeEntireCategory: true)
                        Task { if await model.authorize() { groupPicker = true } }
                    }.disabled(groupName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    ForEach(groups) { group in
                        HStack {
                            Button(group.name) { model.selection = group.selection; model.saveSelection() }
                            Spacer()
                            Button("Remove", role: .destructive) {
                                do { let next = groups.filter { $0.id != group.id }; try FocusAppGroups.write(next, account: account); groups = next } catch { model.error = error.localizedDescription }
                            }
                        }.buttonStyle(.borderless)
                    }
                    Text("Select a saved group to use it for a session. The agent can combine multiple groups.").font(.footnote)
                }.disabled(model.end != nil)
                }
                if !guided {
                Section("Blocking options") {
                    Toggle("Block all apps", isOn: $model.policy.allApps)
                    Toggle("Block all websites", isOn: $model.policy.allWebsites)
                    TextField(model.policy.allWebsites ? "Allowed domains, separated by commas" : "Blocked domains, separated by commas", text: model.policy.allWebsites ? $allowedWebsites : $websites).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("Website rules need no DNS account. Use domains such as youtube.com.").font(.footnote)
                }.disabled(model.end != nil)
                Section("Apps to block") {
                    Button("Choose apps") {
                        Task { if await model.authorize() { picker = true } }
                    }.disabled(model.authorizing || model.end != nil)
                    Text("\(model.selection.applicationTokens.count) apps · \(model.selection.categoryTokens.count) categories · \(model.selection.webDomainTokens.count) websites").font(.footnote).foregroundStyle(.secondary)
                }
                }
                if !guided || setupStep == 2 {
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
                }
                if guided && setupStep == 3 {
                    Section("Your setup") {
                        LabeledContent("App groups", value: String(groups.count))
                        ForEach(groups) { group in Label(group.name, systemImage: "square.stack.3d.up") }
                        LabeledContent("Location", value: location.enabled ? (location.place?.name ?? "Not selected") : "No location restriction")
                        Text("You can return here to add or remove groups and change your location preferences.").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if guided, let end = model.end {
                    Section("Blocking is active") {
                        Text("Ends at \(end.formatted(date: .omitted, time: .shortened)). End this session before changing groups or locations.").font(.footnote)
                        Button("End blocking", role: .destructive) { model.stop() }
                    }
                }
                if !guided {
                if let end = model.end {
                    Section("Focus session") {
                        Text(end, style: .timer).font(.largeTitle).monospacedDigit()
                        Text("Ends at \(end.formatted(date: .omitted, time: .shortened))")
                        Button("End blocking", role: .destructive) { model.stop() }
                    }
                } else {
                    Section("Duration") {
                        Stepper("\(minutes) minutes", value: $minutes, in: 15...720, step: 15)
                        Button("Start blocking") {
                            do { model.policy.domains = try FocusBlockPolicy.domains(websites); model.policy.allowedDomains = try FocusBlockPolicy.domains(allowedWebsites); model.start(minutes: minutes) } catch { model.error = error.localizedDescription }
                        }.disabled(!model.authorized)
                    }
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
            .navigationTitle(guided ? "Set up Screen Time" : "Screen Time")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { if guided { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } } }
            .safeAreaInset(edge: .bottom) {
                if guided {
                    VStack(spacing: 12) {
                        Button {
                            if setupStep == 3 { dismiss() }
                            else if setupStep == 2, location.enabled, let problem = location.validationError() { model.error = problem }
                            else { model.error = nil; setupStep += 1 }
                        } label: {
                            Text(setupStep == 3 ? "Finish setup" : (setupStep == 2 && !location.enabled ? "Skip location" : "Continue")).fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 8)
                        }.buttonStyle(.borderedProminent).disabled(setupStep == 0 && !model.authorized)
                        if setupStep > 0 { Button("Back") { model.error = nil; setupStep -= 1 } }
                    }.padding().background(.regularMaterial)
                }
            }
            .familyActivityPicker(isPresented: $picker, selection: $model.selection)
            .familyActivityPicker(isPresented: $groupPicker, selection: $groupSelection)
            .onChange(of: groupPicker) { wasOpen, isOpen in
                guard wasOpen && !isOpen else { return }
                guard !groupSelection.applicationTokens.isEmpty || !groupSelection.categoryTokens.isEmpty || !groupSelection.webDomainTokens.isEmpty else { return }
                do {
                    let name = groupName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty, name.count <= 100 else { throw TaskFocusError("Use a group name of 1–100 characters.") }
                    let next = groups + [FocusAppGroup(id: UUID().uuidString, name: name, selection: groupSelection)]
                    try FocusAppGroups.write(next, account: account); groups = next; groupName = ""
                } catch { model.error = error.localizedDescription }
            }
            .onChange(of: account) { _, _ in groups = FocusAppGroups.read(account); groupName = ""; groupSelection = FamilyActivitySelection(includeEntireCategory: true); model.selection = FamilyActivitySelection(includeEntireCategory: true); model.policy = FocusBlockPolicy(); websites = ""; allowedWebsites = ""; model.refresh() }
            .onAppear { groups = FocusAppGroups.read(account); websites = model.policy.domains.joined(separator: ", "); allowedWebsites = model.policy.allowedDomains.joined(separator: ", ") }
            .onReceive(pickerRequest) { _ in if guided { setupStep = 1 }; Task { guard model.end == nil else{return};if await model.authorize() { picker = true } } }
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
    @State private var policy = FocusBlockPolicy()
    @State private var domains = ""
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
        let savedPolicy = TaskFocusRules.record(account: account, window: task)?.policy ?? FocusBlockPolicy()
        _policy = State(initialValue: savedPolicy)
        _domains = State(initialValue: savedPolicy.domains.joined(separator: ", "))
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
                Section("Saved groups and websites") {
                    ForEach(FocusAppGroups.read(account)) { group in
                        Button(group.name) {
                            selection.applicationTokens.formUnion(group.selection.applicationTokens)
                            selection.categoryTokens.formUnion(group.selection.categoryTokens)
                            selection.webDomainTokens.formUnion(group.selection.webDomainTokens)
                        }
                    }
                    Toggle("Block all apps", isOn: $policy.allApps)
                    Toggle("Block all websites", isOn: $policy.allWebsites)
                    TextField("Blocked domains, separated by commas", text: $domains).textInputAutocapitalization(.never).autocorrectionDisabled()
                }.disabled(ended)
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
                            policy.domains = try FocusBlockPolicy.domains(domains)
                            try TaskFocusRules.save(account: account, window: task, selection: selection, testAllApps: testAll, policy: policy)
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

/// Executed only by the active account's Planner bridge. No app tokens or keys leave the device.
@MainActor enum PlannerClientScreenTime {
    private static func iso(_ value: String) -> Date? {
        let parser=ISO8601DateFormatter();parser.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return parser.date(from:value) ?? ISO8601DateFormatter().date(from:value)
    }
    private static func digest(_ data: Data) -> String { SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined() }
    private static func bytes(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]) }
    private static func json<T:Encodable>(_ value:T) throws -> Any { try JSONSerialization.jsonObject(with:JSONEncoder().encode(value)) }
    static func state(account:String) throws -> [String:Any] {
        let model=ScreenTimeModel(),location=FocusLocationController.shared,defaults=FocusShieldRules.defaults
        model.refresh()
        let rules=TaskFocusRules.records().values.filter{$0.account==account}.sorted{$0.window.id<$1.window.id}
        let config:[String:Any]=["authorized":model.authorized,"end":model.end?.timeIntervalSince1970 as Any? ?? NSNull(),"selectionDigest":digest(defaults.data(forKey:"focusSelection") ?? Data()),"rulesDigest":digest(defaults.data(forKey:TaskFocusRules.key) ?? Data()),"groupsDigest":digest(defaults.data(forKey:FocusAppGroups.key(account)) ?? Data()),"policyDigest":digest(defaults.data(forKey:"focusBlockPolicy") ?? Data()),"locationEnabled":location.enabled,"locationRule":location.rule.rawValue,"place":try location.place.map{try json($0)} as Any? ?? NSNull(),"preciseTracking":location.preciseTracking,"checkInterval":location.checkInterval,"dnsProfile":UserDefaults.standard.string(forKey:"nextdns-profile:"+account) ?? ""]
        return ["groups":try FocusAppGroups.read(account).map { ["id":$0.id,"name":$0.name,"apps":$0.selection.applicationTokens.count,"categories":$0.selection.categoryTokens.count] as [String:Any] },"policy":try json(model.policy),"fingerprint":digest(try bytes(config)),"now":ISO8601DateFormatter().string(from:Date()),"authorized":model.authorized,"end":model.end?.timeIntervalSince1970 as Any? ?? NSNull(),"selection":["apps":model.selection.applicationTokens.count,"categories":model.selection.categoryTokens.count,"websites":model.selection.webDomainTokens.count],"globalShieldConfigured":model.store.shield.applications != nil || model.store.shield.applicationCategories != nil || model.store.shield.webDomains != nil || model.store.shield.webDomainCategories != nil || model.store.webContent.blockedByFilter != nil,"taskRules":try rules.map{["task":try json($0.window),"selection":["apps":$0.selection.applicationTokens.count,"categories":$0.selection.categoryTokens.count,"websites":$0.selection.webDomainTokens.count]]},"location":["enabled":location.enabled,"rule":location.rule.rawValue,"place":config["place"]!,"preciseTracking":location.preciseTracking,"checkInterval":location.checkInterval,"validationError":location.validationError() as Any? ?? NSNull()],"nextDNS":["hasCredential":!NextDNSCredentials.load(account).isEmpty,"profile":config["dnsProfile"]!],"limits":"Counts and configured shields do not prove OS enforcement. The user chooses opaque app tokens in Apple's picker; permissions need OS approval. DNS device routing must be verified separately."]
    }
    static func run(account:String,command:[String:Any],key:String,issued:String) async throws -> [String:Any] {
        guard account==WidgetTaskControl.defaults.string(forKey:"feedback-account"),let date=iso(issued),Date().timeIntervalSince(date)<7200,Date().timeIntervalSince(date) > -300,key.count<=200,let action=command["action"] as? String else {throw TaskFocusError("Expired request or account changed. No native change was made.")}
        let defaults=FocusShieldRules.defaults,cacheKey="planner-client-receipts:"+account,hash=digest(try bytes(command))
        var cache=(defaults.data(forKey:cacheKey).flatMap{try? JSONSerialization.jsonObject(with:$0)} as? [String:[String:Any]]) ?? [:]
        if let prior=cache[key] {
            guard prior["digest"] as? String==hash else {throw TaskFocusError("This command ID belongs to different arguments.")}
            guard let result=prior["result"] as? [String:Any] else {throw TaskFocusError("This native command already started. Read current state; do not repeat a write blindly.")}
            var replay=result;replay["replayed"]=true;return replay
        }
        let before=try state(account:account),writes=["screen_time_start","screen_time_stop","screen_time_task_save","screen_time_task_remove","screen_time_location","screen_time_dns_domain","screen_time_configure"]
        if writes.contains(action),command["expected"] as? String != before["fingerprint"] as? String {throw TaskFocusError("Screen Time changed. Read its current fingerprint before editing.")}
        cache[key]=["digest":hash,"at":Date().timeIntervalSince1970];defaults.set(try bytes(cache),forKey:cacheKey)
        var detail:[String:Any]=[:]
        do {
            let model=ScreenTimeModel(),location=FocusLocationController.shared
            switch action {
            case "screen_time_read":break
            case "screen_time_authorize":detail=["approved":await model.authorize(),"userActionRequired":!model.authorized]
            case "screen_time_pick_apps":
                guard model.end==nil else {throw TaskFocusError("End the current focus session before changing apps.")}
                NotificationCenter.default.post(name:.init("PlannerAgentChooseApps"),object:nil)
                detail=["pickerRequested":true,"userActionRequired":true,"selectionConfirmed":false]
            case "screen_time_configure":
                guard model.end == nil else { throw TaskFocusError("End the current session before changing its blocking options.") }
                let ids = command["groupIds"] as? [String] ?? []
                let selection = try FocusAppGroups.selection(ids, account: account)
                let policy = FocusBlockPolicy(allApps: command["allApps"] as? Bool ?? false, domains: try FocusBlockPolicy.domains((command["domains"] as? [String] ?? []).joined(separator: ",")), allWebsites: command["allWebsites"] as? Bool ?? false, allowedDomains: try FocusBlockPolicy.domains((command["allowedDomains"] as? [String] ?? []).joined(separator: ",")))
                model.selection = selection; model.saveSelection()
                defaults.set(try JSONEncoder().encode(policy), forKey: "focusBlockPolicy")
            case "screen_time_start":
                guard let value=command["end"] as? String,let end=iso(value) else {throw TaskFocusError("Choose a valid absolute focus end.")}
                model.start(minutes:Int(ceil(end.timeIntervalSinceNow/60)),until:end)
                if let error=model.error {throw TaskFocusError(error)}
                guard model.end != nil else {throw TaskFocusError("Focus monitoring did not start.")}
            case "screen_time_stop":model.stop()
            case "screen_time_task_save":
                guard let raw=command["task"] as? [String:Any],let id=raw["id"] as? String,let source=raw["sourceEventId"] as? String,let title=raw["title"] as? String,let startValue=raw["start"] as? String,let endValue=raw["end"] as? String,let start=iso(startValue),let end=iso(endValue) else {throw TaskFocusError("Choose a valid task occurrence.")}
                try TaskFocusRules.save(account:account,window:.init(id:id,sourceEventId:source,title:title,start:start.timeIntervalSince1970,end:end.timeIntervalSince1970),selection:model.selection,policy:model.policy)
            case "screen_time_task_remove":
                guard let id=command["taskId"] as? String else {throw TaskFocusError("Choose one task occurrence.")}
                for record in TaskFocusRules.records().values where record.account==account && record.window.id==id {TaskFocusRules.remove(record.name)}
            case "screen_time_location":
                guard model.end==nil else {throw TaskFocusError("End the focus session before changing location rules.")}
                let rule=(command["rule"] as? String).flatMap(FocusLocationRule.init(rawValue:)) ?? location.rule
                let precise=command["preciseTracking"] as? Bool ?? location.preciseTracking
                guard rule != .allowInside || precise else {throw TaskFocusError("Allow-only-here requires precise tracking.")}
                if let raw=command["place"] as? [String:Any] {let place=try JSONDecoder().decode(FocusPlace.self,from:bytes(raw));guard place.isValid else{throw TaskFocusError("Invalid focus location.")};location.setPlace(place)}
                location.setRule(rule);location.setPreciseTracking(precise)
                if let interval=command["checkInterval"] as? Double {guard [120.0,180,300,600].contains(interval) else{throw TaskFocusError("Unsupported location interval.")};location.setCheckInterval(interval)}
                if let enabled=command["enabled"] as? Bool {location.setEnabled(enabled)}
            case "screen_time_dns_read","screen_time_dns_domain":
                let profile=UserDefaults.standard.string(forKey:"nextdns-profile:"+account) ?? "",apiKey=NextDNSCredentials.load(account)
                guard profile.range(of:#"^[a-fA-F0-9]{6}$"#,options:.regularExpression) != nil,!apiKey.isEmpty else {throw TaskFocusError("Connect NextDNS in Screen Time first. No API key is exposed to Chat.")}
                var suffix="",method="GET",payload:[String:Any]?
                if action=="screen_time_dns_domain" {
                    guard let domain=command["domain"] as? String,domain.count<=253,domain.range(of:#"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"#,options:.regularExpression) != nil,let blocked=command["blocked"] as? Bool else {throw TaskFocusError("Choose a valid website domain.")}
                    if blocked {method="POST";payload=["id":domain,"active":true]}else{method="DELETE";suffix="/"+domain}
                }
                var target=URLComponents(string:"https://api.nextdns.io/profiles/"+profile+"/denylist"+suffix)!
                if let cursor=command["cursor"] as? String {guard action=="screen_time_dns_read",cursor.count<=1000 else{throw TaskFocusError("Invalid NextDNS page cursor.")};target.queryItems=[URLQueryItem(name:"cursor",value:cursor)]}
                var request=URLRequest(url:target.url!);request.httpMethod=method;request.timeoutInterval=25;request.setValue(apiKey,forHTTPHeaderField:"X-Api-Key")
                if let payload{request.httpBody=try bytes(payload);request.setValue("application/json",forHTTPHeaderField:"Content-Type")}
                let (data,response)=try await URLSession.shared.data(for:request)
                guard let http=response as? HTTPURLResponse,(200...299).contains(http.statusCode) else{throw TaskFocusError("NextDNS request failed. Read the denylist before retrying; an interrupted write may have completed.")}
                let responseBody=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] ?? [:]
                guard (responseBody["errors"] as? [Any] ?? []).isEmpty else{throw TaskFocusError("NextDNS rejected this request. Read the current denylist.")}
                detail=["nextDNS":responseBody,"deviceDNSVerified":false]
            default:throw TaskFocusError("Unknown native control.")
            }
            guard account==WidgetTaskControl.defaults.string(forKey:"feedback-account") else {throw TaskFocusError("Your account changed. Read current state after signing in.")}
            let result:[String:Any]=["state":try state(account:account),"detail":detail]
            cache=(defaults.data(forKey:cacheKey).flatMap{try? JSONSerialization.jsonObject(with:$0)} as? [String:[String:Any]]) ?? [:];cache[key]=["digest":hash,"at":Date().timeIntervalSince1970,"result":result]
            let ordered=cache.sorted{($0.value["at"] as? Double ?? 0)>($1.value["at"] as? Double ?? 0)};defaults.set(try bytes(Dictionary(uniqueKeysWithValues:ordered.filter{($0.value["at"] as? Double ?? 0)>Date().timeIntervalSince1970-7200}.map{($0.key,$0.value)})),forKey:cacheKey)
            return result
        }catch{
            // Failed/uncertain calls stay receipted. A fresh read is safe; automatic write replay is not.
            throw error
        }
    }
}
#if DEBUG
extension PlannerClientScreenTime {
    static func verify(account:String) async -> [String:Any] {
        var checks:[String:Any]=[:]
        let issued=ISO8601DateFormatter().string(from:Date()),prefix=UUID().uuidString
        func call(_ label:String,_ command:[String:Any]) async throws -> [String:Any] {try await run(account:account,command:command,key:prefix+":"+label,issued:issued)}
        do {
            checks["domainNormalization"] = try FocusBlockPolicy.domains("YouTube.com, youtube.com instagram.com") == ["instagram.com", "youtube.com"]
            do { _ = try FocusBlockPolicy.domains("https://youtube.com/path"); checks["invalidDomainRejected"] = false } catch { checks["invalidDomainRejected"] = true }
            do { _ = try FocusBlockPolicy.domains((0..<51).map { "site\($0).com" }.joined(separator: ",")); checks["domainLimit"] = false } catch { checks["domainLimit"] = true }
            let groupKey = FocusAppGroups.key(account), originalGroups = FocusShieldRules.defaults.data(forKey: groupKey)
            do {
                defer { if let originalGroups { FocusShieldRules.defaults.set(originalGroups, forKey: groupKey) } else { FocusShieldRules.defaults.removeObject(forKey: groupKey) } }
                let id = UUID().uuidString
                try FocusAppGroups.write([FocusAppGroup(id: id, name: "QA temporary", selection: FamilyActivitySelection())], account: account)
                checks["groupPersistence"] = FocusAppGroups.read(account).first?.id == id
                checks["groupAccountIsolation"] = FocusAppGroups.read("qa-other-" + id).isEmpty
                _ = try FocusAppGroups.selection([id], account: account)
                do { _ = try FocusAppGroups.selection([UUID().uuidString], account: account); checks["unknownGroupRejected"] = false } catch { checks["unknownGroupRejected"] = true }
            }
            let qaModel = ScreenTimeModel()
            if qaModel.authorized && qaModel.end == nil {
                let defaults = FocusShieldRules.defaults
                let oldSelection = defaults.data(forKey: "focusSelection"), oldPolicy = defaults.data(forKey: "focusBlockPolicy")
                defer {
                    ScreenTimeModel().stop()
                    for (key, data) in [("focusSelection", oldSelection), ("focusBlockPolicy", oldPolicy)] { if let data { defaults.set(data, forKey: key) } else { defaults.removeObject(forKey: key) } }
                }
                _ = try await call("configure", ["action":"screen_time_configure", "expected":try state(account:account)["fingerprint"]!, "groupIds":[], "allApps":true, "domains":["example.com"], "allWebsites":false, "allowedDomains":[]])
                checks["agentPolicyPersisted"] = ScreenTimeModel().policy.allApps && ScreenTimeModel().policy.domains == ["example.com"]
                _ = try await call("policy-start", ["action":"screen_time_start", "expected":try state(account:account)["fingerprint"]!, "end":ISO8601DateFormatter().string(from:Date().addingTimeInterval(960))])
                let store = ManagedSettingsStore(named: .init("plannerFocus"))
                checks["allAppsConfigured"] = store.shield.applicationCategories == .all(except: [])
                checks["domainsConfigured"] = store.webContent.blockedByFilter == .specific([WebDomain(domain:"example.com")])
                _ = try await call("policy-stop", ["action":"screen_time_stop", "expected":try state(account:account)["fingerprint"]!])
                checks["policyStopClears"] = store.webContent.blockedByFilter == nil && store.shield.applicationCategories == nil
            }
            let baseline=try state(account:account);checks["baseline"]=baseline
            let read=try await call("read",["action":"screen_time_read"]);guard read["state"] != nil else {throw TaskFocusError("Missing native read state.")};checks["read"]=true
            do { _=try await run(account:"not-current-account",command:["action":"screen_time_read"],key:prefix+":other",issued:issued);checks["ownerRejected"]=false }catch{checks["ownerRejected"]=true}
            do {_=try await call("stale",["action":"screen_time_stop","expected":String(repeating:"0",count:64)]);checks["staleRejected"]=false}catch{checks["staleRejected"]=true}
            let model=ScreenTimeModel(),hasSelection = !model.selection.applicationTokens.isEmpty || !model.selection.categoryTokens.isEmpty || !model.selection.webDomainTokens.isEmpty
            if model.end==nil && model.authorized && hasSelection {
                let end=ISO8601DateFormatter().string(from:Date().addingTimeInterval(960)),startCommand:[String:Any]=["action":"screen_time_start","expected":baseline["fingerprint"]!,"end":end]
                _=try await call("start",startCommand);let active=try state(account:account);guard !(active["end"] is NSNull) else {throw TaskFocusError("Start did not persist.")};checks["start"]=true;checks["shieldConfigured"]=active["globalShieldConfigured"]
                _=try await call("stop",["action":"screen_time_stop","expected":active["fingerprint"]!]);checks["stop"]=try state(account:account)["end"] is NSNull
                _=try await call("start",startCommand);checks["replayDidNotRestart"]=try state(account:account)["end"] is NSNull
                do {_=try await call("start",["action":"screen_time_stop","expected":active["fingerprint"]!]);checks["changedIdRejected"]=false}catch{checks["changedIdRejected"]=true}
                let task:[String:Any]=["id":prefix,"sourceEventId":"client-control-qa","title":"Disposable client control QA","start":ISO8601DateFormatter().string(from:Date().addingTimeInterval(1800)),"end":ISO8601DateFormatter().string(from:Date().addingTimeInterval(2760))]
                _=try await call("task-save",["action":"screen_time_task_save","expected":try state(account:account)["fingerprint"]!,"task":task]);checks["taskSave"]=TaskFocusRules.records().values.contains{$0.account==account && $0.window.id==prefix}
                _=try await call("task-remove",["action":"screen_time_task_remove","expected":try state(account:account)["fingerprint"]!,"taskId":prefix]);checks["taskRemoved"] = !TaskFocusRules.records().values.contains{$0.account==account && $0.window.id==prefix}
            }else{checks["blockingTestsSkipped"]="Requires idle session, approved Screen Time and a user-selected app/category. Existing policy was preserved."}
            if ScreenTimeModel().end==nil {
                let location=FocusLocationController.shared,old=location.checkInterval,next=old==180 ? 300.0 : 180.0
                _=try await call("location",["action":"screen_time_location","expected":try state(account:account)["fingerprint"]!,"checkInterval":next]);checks["locationChanged"]=location.checkInterval==next
                _=try await call("location-restore",["action":"screen_time_location","expected":try state(account:account)["fingerprint"]!,"checkInterval":old]);checks["locationRestored"]=location.checkInterval==old
            }
            checks["final"]=try state(account:account);checks["finished"]=true
        }catch{
            checks["error"]=error.localizedDescription
            // Only clean this run's own policy. Never stop a user's pre-existing session.
            if checks["start"] as? Bool==true {ScreenTimeModel().stop()}
            for record in TaskFocusRules.records().values where record.account==account && record.window.id==prefix {TaskFocusRules.remove(record.name)}
        }
        return checks
    }
}
#endif
