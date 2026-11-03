import SwiftUI
import FamilyControls
import ManagedSettings
import DeviceActivity

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
