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
