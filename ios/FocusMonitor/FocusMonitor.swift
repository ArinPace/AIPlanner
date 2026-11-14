import DeviceActivity
import ManagedSettings
import Foundation

class FocusMonitor: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        if activity.rawValue.hasPrefix(TaskFocusRules.prefix) { TaskFocusRules.apply(activity.rawValue) }
    }
    override func intervalWillEndWarning(for activity: DeviceActivityName) {
        super.intervalWillEndWarning(for: activity)
        if activity.rawValue.hasPrefix(TaskFocusRules.prefix) { TaskFocusRules.apply(activity.rawValue) }
    }
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        if activity.rawValue.hasPrefix(TaskFocusRules.prefix) { TaskFocusRules.apply(activity.rawValue); if let account = FocusShieldRules.defaults.string(forKey: "feedback-account") { try? TagFocusRules.refresh(account: account) }; return }
        if activity == FocusShieldRules.leaseActivity { FocusShieldRules.verificationExpired(); return }
        guard activity.rawValue == "plannerFocus" else { return }
        let defaults = UserDefaults(suiteName: "group.com.arinpace.aiplanner")
        // Ignore a delayed callback from an earlier session after a new one starts.
        guard (defaults?.double(forKey: "focusEnd") ?? 0) <= Date().timeIntervalSince1970 else { return }
        ManagedSettingsStore(named: .init("plannerFocus")).clearAllSettings()
        defaults?.removeObject(forKey: "focusEnd")
        FocusShieldRules.cancelVerification()
        defaults?.set(Date().timeIntervalSince1970, forKey: "focusMonitorEndedAt")
    }
}
