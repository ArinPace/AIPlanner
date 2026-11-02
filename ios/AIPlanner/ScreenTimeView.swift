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
        // Align the persisted deadline with DeviceActivity's whole-second schedule.
        let now = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970))
        let until = now.addingTimeInterval(Double(minutes) * 60 + 1)
        let calendar = Calendar.current
        let fields: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        do {
            let encodedSelection = try JSONEncoder().encode(selection)
            let schedule = DeviceActivitySchedule(intervalStart: calendar.dateComponents(fields, from: now), intervalEnd: calendar.dateComponents(fields, from: until), repeats: false)
            try DeviceActivityCenter().startMonitoring(activity, during: schedule)
            store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
            store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
            store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
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
            defaults.set(encodedSelection, forKey: "focusSelection")
            defaults.set(until.timeIntervalSince1970, forKey: "focusEnd")
            end = until; error = nil
        } catch { self.error = error.localizedDescription }
    }
    func saveSelection() {
        if let data = try? JSONEncoder().encode(selection) { defaults.set(data, forKey: "focusSelection") }
        error = nil
    }
    func stop() {
        store.clearAllSettings()
        defaults.removeObject(forKey: "focusEnd")
        DeviceActivityCenter().stopMonitoring([activity])
        end = nil; error = nil
    }
}

struct ScreenTimeView: View {
    @StateObject private var model = ScreenTimeModel()
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
                if ProcessInfo.processInfo.arguments.contains("-UITestFocusExpiry") {
                    Text(String(model.monitorEndedAt))
                        .accessibilityIdentifier("focusMonitorExpiry")
                }
                #endif
                if let error = model.error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("Screen Time")
            .familyActivityPicker(isPresented: $picker, selection: $model.selection)
        }
        .onChange(of: model.selection) { _, _ in model.saveSelection() }
        .task(id: picker) {
            guard !picker else { return }
            while !Task.isCancelled {
                model.refresh()
                try? await Task.sleep(for: .seconds(1))
            }
        }
        .onChange(of: phase) { _, value in if value == .active { model.refresh() } }
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
