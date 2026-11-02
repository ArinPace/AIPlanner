import DeviceActivity
import ManagedSettings
import Foundation

class FocusMonitor: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
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
