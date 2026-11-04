import Foundation

struct TaskNotificationOptions: Codable, Equatable {
    var enabled = false
    var switches = true
    var advance = true
    var longTaskMinutes = 30
    var minutes = [5]
    var valid: Bool { (1...1440).contains(longTaskMinutes) && !minutes.isEmpty && minutes.count <= 10 && minutes.allSatisfy { (1...1440).contains($0) } }
}
struct TaskNotificationItem: Equatable {
    let id: String
    let at: Double
    let title: String
    let body: String
}
enum TaskNotificationPlan {
    static func make(schedule: WidgetSchedule, options: TaskNotificationOptions, now: Double) -> [TaskNotificationItem] {
        guard options.enabled, options.valid, schedule.validUntil > now else { return [] }
        let events = schedule.events.filter { $0.end > $0.start }
        func current(_ time: Double) -> WidgetTask? { schedule.current(at: Date(timeIntervalSince1970: time)) }
        var items = [TaskNotificationItem]()
        if options.switches {
            for at in Set(events.flatMap { [$0.start, $0.end] }).sorted() where at > now && at < schedule.validUntil {
                let before = current(at - 0.001), after = current(at + 0.001)
                guard before?.id != after?.id else { continue }
                let body = after.map { (before.map { $0.title + " has ended. " } ?? "") + "Now: " + $0.title } ?? "\(before?.title ?? "Your task") has ended. Now: Free time"
                items.append(TaskNotificationItem(id: "switch:\(at)", at: at, title: after == nil ? "Task time is over" : "Time to switch tasks", body: body))
            }
        }
        if options.advance {
            for event in events where event.isFreeTime != true && event.end - event.start >= Double(options.longTaskMinutes * 60) && current(event.end - 0.001)?.id == event.id {
                for minutes in Set(options.minutes) {
                    let at = event.end - Double(minutes * 60)
                    guard at > now, at > event.start, at < schedule.validUntil, current(at)?.id == event.id else { continue }
                    items.append(TaskNotificationItem(id: "advance:\(event.id):\(event.end):\(minutes)", at: at, title: "\(minutes) \(minutes == 1 ? "minute" : "minutes") left", body: event.title))
                }
            }
        }
        return items.sorted { $0.at == $1.at ? $0.id < $1.id : $0.at < $1.at }
    }
}

#if os(iOS) && canImport(UserNotifications)
import UserNotifications

actor PlannerTaskNotifications {
    static let shared = PlannerTaskNotifications()
    private let center = UNUserNotificationCenter.current()
    private let prefix = "planner.task."
    private var running = false
    private var dirty = false
    private var defaults: UserDefaults { UserDefaults(suiteName: WidgetScheduleStore.group)! }
    func configure(account: String, options: TaskNotificationOptions) async throws {
        guard account == defaults.string(forKey: "feedback-account"), options.valid else { throw NSError(domain: "TaskNotifications", code: 1, userInfo: [NSLocalizedDescriptionKey: "Notification account changed or settings are invalid."]) }
        defaults.set(try JSONEncoder().encode(options), forKey: "task-notifications:" + account)
        await refresh()
    }
    func refresh() async {
        dirty = true
        guard !running else { return }
        running = true
        defer { running = false }
        while dirty {
            dirty = false
            await rebuild()
        }
    }
    private func rebuild() async {
        defaults.removeObject(forKey: "task-notification-error")
        let pending = await center.pendingNotificationRequests()
        let owned = pending.filter { $0.identifier.hasPrefix(prefix) }
        guard let account = defaults.string(forKey: "feedback-account"), let data = defaults.data(forKey: "task-notifications:" + account), let options = try? JSONDecoder().decode(TaskNotificationOptions.self, from: data), options.enabled else {
            center.removePendingNotificationRequests(withIdentifiers: owned.map(\.identifier))
            let delivered = await center.deliveredNotifications()
            center.removeDeliveredNotifications(withIdentifiers: delivered.filter { $0.request.identifier.hasPrefix(prefix) }.map { $0.request.identifier })
            return
        }
        let permission = await center.notificationSettings()
        guard [.authorized, .provisional, .ephemeral].contains(permission.authorizationStatus) else { center.removePendingNotificationRequests(withIdentifiers: owned.map(\.identifier)); return }
        let schedule = WidgetTimeOverrides.applying(to: WidgetScheduleStore.load())
        // Leave a few slots for other notification features; iOS bounds pending requests.
        let items = TaskNotificationPlan.make(schedule: schedule, options: options, now: Date().timeIntervalSince1970).prefix(60)
        let desired = Set(items.map { prefix + $0.id })
        center.removePendingNotificationRequests(withIdentifiers: owned.filter { !desired.contains($0.identifier) }.map(\.identifier))
        for item in items {
            guard account == defaults.string(forKey: "feedback-account") else { dirty = true; return }
            if let existing = owned.first(where: { $0.identifier == prefix + item.id }), existing.content.title == item.title, existing.content.body == item.body, existing.content.userInfo["plannerAccount"] as? String == account,
               let date = (existing.trigger as? UNTimeIntervalNotificationTrigger)?.nextTriggerDate(), abs(date.timeIntervalSince1970 - item.at) < 2 { continue }
            let delay = item.at - Date().timeIntervalSince1970
            if delay <= 0 { continue }
            let content = UNMutableNotificationContent()
            content.title = item.title; content.body = item.body; content.sound = .default
            content.userInfo = ["plannerAccount": account, "taskNotice": item.id]
            let request = UNNotificationRequest(identifier: prefix + item.id, content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false))
            do { try await center.add(request) } catch { defaults.set("Could not schedule task notifications: " + error.localizedDescription, forKey: "task-notification-error") }
        }
    }
    func status() async -> [String: Any] {
        let permission = await center.notificationSettings()
        let state: String
        switch permission.authorizationStatus {
        case .authorized: state = "authorized"
        case .provisional: state = "provisional"
        case .ephemeral: state = "ephemeral"
        case .denied: state = "denied"
        default: state = "notDetermined"
        }
        let pending = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix(prefix) }
        return ["authorization": state, "scheduledCount": pending.count, "error": defaults.string(forKey: "task-notification-error") ?? ""]
    }
    func requestPermission() async throws -> [String: Any] {
        _ = try await center.requestAuthorization(options: [.alert, .sound])
        await refresh()
        return await status()
    }
}
#endif
