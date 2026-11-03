import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity

enum FocusLocationRule: String, CaseIterable {
    case allowInside, blockInside
    var title: String { self == .allowInside ? "Allow only here" : "Block only here" }
    func shouldBlock(inside: Bool?) -> Bool {
        self == .allowInside ? inside != true : inside == true
    }
}

/// Shared with the monitor extension: access must expire even if Planner cannot run.
enum FocusShieldRules {
    static let leaseActivity = DeviceActivityName("plannerLocationLease")
    static let defaults = UserDefaults(suiteName: "group.com.arinpace.aiplanner")!
    static var rule: FocusLocationRule { FocusLocationRule(rawValue: defaults.string(forKey: "focusLocationRule") ?? "") ?? .blockInside }
    static func apply(blocked: Bool) {
        let store = ManagedSettingsStore(named: .init("plannerFocus"))
        guard blocked, defaults.double(forKey: "focusEnd") > Date().timeIntervalSince1970,
              let data = defaults.data(forKey: "focusSelection"),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            store.clearAllSettings(); return
        }
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        if defaults.double(forKey: "focusEnd") <= Date().timeIntervalSince1970 { store.clearAllSettings() }
    }
    static func registerVerification(until: Date) throws {
        // DeviceActivity permits an ongoing interval. Its total span remains 15 minutes;
        // only its remaining portion is the short verification lease.
        let end = Date(timeIntervalSince1970: floor(until.timeIntervalSince1970))
        let start = end.addingTimeInterval(-15 * 60)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let fields: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second, .timeZone]
        defaults.set(end.timeIntervalSince1970, forKey: "focusLocationVerifiedUntil")
        do {
            try DeviceActivityCenter().startMonitoring(leaseActivity, during: DeviceActivitySchedule(
                intervalStart: calendar.dateComponents(fields, from: start),
                intervalEnd: calendar.dateComponents(fields, from: end), repeats: false))
        } catch {
            defaults.removeObject(forKey: "focusLocationVerifiedUntil")
            apply(blocked: rule.shouldBlock(inside: nil))
            throw error
        }
    }
    static func cancelVerification() {
        defaults.removeObject(forKey: "focusLocationVerifiedUntil")
        DeviceActivityCenter().stopMonitoring([leaseActivity])
    }
    static func verificationExpired() {
        let now = Date().timeIntervalSince1970
        let deadline = defaults.double(forKey: "focusLocationVerifiedUntil")
        guard deadline > 0, deadline <= now, defaults.double(forKey: "focusEnd") > now,
              defaults.bool(forKey: "focusLocationEnabled") else { return }
        defaults.removeObject(forKey: "focusLocationVerifiedUntil")
        apply(blocked: rule.shouldBlock(inside: nil))
        defaults.set(now, forKey: "focusLocationLeaseExpiredAt")
    }
}

struct TaskFocusWindow: Codable, Equatable {
    var id: String
    var sourceEventId: String
    var title: String
    var start: Double
    var end: Double
    var valid: Bool { !id.isEmpty && id.count <= 500 && sourceEventId.count <= 200 && title.count <= 300 && start.isFinite && end.isFinite && end > start }
}
struct TaskFocusRecord: Codable {
    var name: String
    var account: String
    var window: TaskFocusWindow
    var selection: FamilyActivitySelection
    var testAllApps: Bool = false
}
/// Each occurrence has its own settings store, so overlapping task blocks cannot clear one another.
enum TaskFocusRules {
    static let prefix = "plannerTask."
    static let key = "taskFocusRules"
    static let defaults = FocusShieldRules.defaults
    static func records() -> [String: TaskFocusRecord] {
        guard let data = defaults.data(forKey: key) else { return [:] }
        return (try? JSONDecoder().decode([String: TaskFocusRecord].self, from: data)) ?? [:]
    }
    static func write(_ values: [String: TaskFocusRecord]) { if let data = try? JSONEncoder().encode(values) { defaults.set(data, forKey: key) } }
    static func record(account: String, window: TaskFocusWindow) -> TaskFocusRecord? {
        records().values.first { $0.account == account && $0.window.id == window.id }
    }
    static func register(_ record: TaskFocusRecord) throws {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let fields: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second, .timeZone]
        let end = floor(record.window.end), start = floor(record.window.start)
        // The monitor needs a 15-minute span. For short tasks its end warning starts
        // shielding at the real task start; the interval end still expires at the real task end.
        let monitorStart = min(start, end - 900)
        let warning = start > monitorStart ? DateComponents(second: Int(end - start)) : nil
        try DeviceActivityCenter().startMonitoring(.init(record.name), during: DeviceActivitySchedule(
            intervalStart: calendar.dateComponents(fields, from: Date(timeIntervalSince1970: monitorStart)),
            intervalEnd: calendar.dateComponents(fields, from: Date(timeIntervalSince1970: end)), repeats: false, warningTime: warning))
    }
    static func save(account: String, window: TaskFocusWindow, selection: FamilyActivitySelection, testAllApps: Bool = false) throws {
        guard account == defaults.string(forKey: "feedback-account"), window.valid, window.end > Date().timeIntervalSince1970 else { throw TaskFocusError("This task has ended or your account changed. Refresh your calendar.") }
        guard AuthorizationCenter.shared.authorizationStatus == .approved else { throw TaskFocusError("Allow Screen Time access first.") }
        guard testAllApps || !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty else { throw TaskFocusError("Choose apps to block first.") }
        refreshAll()
        var values = records()
        let old = record(account: account, window: window)
        guard let name = old?.name ?? (0..<16).map({ prefix + String($0) }).first(where: { values[$0] == nil }) else { throw TaskFocusError("Remove a scheduled task block before adding another.") }
        let next = TaskFocusRecord(name: name, account: account, window: window, selection: selection, testAllApps: testAllApps)
        values[name] = next; write(values)
        do { try register(next) }
        catch { values[name] = old; write(values); throw error }
        apply(name)
    }
    static func apply(_ name: String) {
        let store = ManagedSettingsStore(named: .init(name))
        guard let record = records()[name] else { store.clearAllSettings(); return }
        let now = Date().timeIntervalSince1970
        guard record.account == defaults.string(forKey: "feedback-account"), now < record.window.end else { remove(name); return }
        guard now >= record.window.start else { store.clearAllSettings(); return }
        store.shield.applications = record.selection.applicationTokens.isEmpty ? nil : record.selection.applicationTokens
        store.shield.applicationCategories = record.selection.categoryTokens.isEmpty ? nil : .specific(record.selection.categoryTokens)
        store.shield.webDomains = record.selection.webDomainTokens.isEmpty ? nil : record.selection.webDomainTokens
        #if DEBUG && targetEnvironment(simulator)
        if record.testAllApps { store.shield.applicationCategories = .all(except: []) }
        #endif
    }
    static func remove(_ name: String) {
        var values = records(); guard values.removeValue(forKey: name) != nil else { return }; write(values)
        ManagedSettingsStore(named: .init(name)).clearAllSettings()
        DeviceActivityCenter().stopMonitoring([.init(name)])
    }
    static func refreshAll() { for name in records().keys { apply(name) } }
    static func clearAll() { for name in records().keys { remove(name) } }
    static func sync(windows: [TaskFocusWindow], from: Double, until: Double, account: String) {
        guard account == defaults.string(forKey: "feedback-account") else { return }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "America/New_York")!
        for var record in records().values where record.account == account && record.window.start < until && record.window.end > from {
            let match = windows.first { $0.id == record.window.id } ?? windows.first { $0.sourceEventId == record.window.sourceEventId && calendar.isDate(Date(timeIntervalSince1970: $0.start), inSameDayAs: Date(timeIntervalSince1970: record.window.start)) }
            guard let match else { remove(record.name); continue }
            guard match.start != record.window.start || match.end != record.window.end || match.id != record.window.id else { continue }
            record.window = match
            var values = records(); values[record.name] = record; write(values)
            do { try register(record); apply(record.name) } catch { remove(record.name) }
        }
        refreshAll()
    }
}
struct TaskFocusError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
