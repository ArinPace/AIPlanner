import Foundation
import AppIntents
import WidgetKit
import Security

enum WidgetTaskControl {
    static var defaults: UserDefaults { UserDefaults(suiteName: WidgetScheduleStore.group)! }
    static func key(_ task: WidgetTask) -> String { "task-time:" + task.id }
    static func remaining(_ task: WidgetTask, now: Date = Date()) -> Int {
        task.remainingMinutes(at: now, adjustedEnd: draftEnd(task))
    }
    static func draftEnd(_ task: WidgetTask) -> Double {
        defaults.object(forKey: key(task)) as? Double ?? WidgetTimeOverrides.record(for: task)?.requestedEnd ?? task.end
    }
    static func pending() -> WidgetTaskFeedback? {
        guard let data = defaults.data(forKey: "task-feedback") else { return nil }
        return try? JSONDecoder().decode(WidgetTaskFeedback.self, from: data)
    }
    static func adjust(_ task: WidgetTask, minutes: Int) {
        guard pending() == nil, WidgetTimeOverrides.load().isEmpty else { return }
        defaults.set(task.adjustedEnd(at: Date(), previous: draftEnd(task), delta: minutes), forKey: key(task))
    }
    static func submit(_ task: WidgetTask, done: Bool) throws {
        guard currentTask(at: Date())?.id == task.id else { throw ControlError.stale }
        guard defaults.data(forKey: "task-feedback") == nil else { return }
        if !done && !WidgetTimeOverrides.load().isEmpty { return }
        let now = Date().timeIntervalSince1970
        let canonical = WidgetScheduleStore.load().events.first { $0.id == task.id } ?? WidgetTimeOverrides.record(for: task)?.task ?? task
        let feedback = WidgetTaskFeedback(id: UUID().uuidString, task: canonical, remainingMinutes: done ? 0 : remaining(task), done: done, reportedAt: now, requestedEnd: done ? now : max(now, draftEnd(task)))
        defaults.set(try JSONEncoder().encode(feedback), forKey: "task-feedback")
        WidgetTimeOverrides.store(feedback)
        WidgetCenter.shared.reloadAllTimelines()
    }
    static func displaySchedule() -> WidgetSchedule { WidgetTimeOverrides.applying(to: WidgetScheduleStore.load()) }
    static func currentTask(at date: Date) -> WidgetTask? {
        let schedule = displaySchedule()
        return WidgetTimeOverrides.preferred(in: schedule, at: date) ?? schedule.current(at: date)
    }
    static func clear() {
        WidgetBackgroundDelivery.clear()
        WidgetTimeOverrides.clear()
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix("task-time:") || key == "task-feedback" || key.hasPrefix("widget-delivery:") { defaults.removeObject(forKey: key) }
    }
    enum ControlError: Error, LocalizedError {
        case stale
        var errorDescription: String? { "This activity has ended. Refresh the widget before adjusting it." }
    }
}
struct AdjustTaskTimeIntent: AppIntent {
    static var title: LocalizedStringResource = "Adjust task time"
    @Parameter(title: "Task") var taskID: String
    @Parameter(title: "Minutes") var minutes: Int
    init() {}
    init(task: WidgetTask, minutes: Int) { self.taskID = task.id; self.minutes = minutes }
    @MainActor func perform() async throws -> some IntentResult {
        guard let task = WidgetTaskControl.currentTask(at: Date()), task.id == taskID else { throw WidgetTaskControl.ControlError.stale }
        let step = task.adjustmentStep(remaining: WidgetTaskControl.remaining(task))
        WidgetTaskControl.adjust(task, minutes: minutes < 0 ? -step : step)
        return .result()
    }
}
struct SubmitTaskTimeIntent: AppIntent {
    static var title: LocalizedStringResource = "Send task feedback to Planner"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "Task") var taskID: String
    @Parameter(title: "Done") var done: Bool
    init() {}
    init(task: WidgetTask, done: Bool) { self.taskID = task.id; self.done = done }
    @MainActor func perform() async throws -> some IntentResult {
        guard let task = WidgetTaskControl.currentTask(at: Date()), task.id == taskID else { throw WidgetTaskControl.ControlError.stale }
        try WidgetTaskControl.submit(task, done: done)
        try await WidgetBackgroundDelivery.sendPending()
        return .result()
    }
}

struct FillFreeTimeIntent: AppIntent {
    static var title: LocalizedStringResource = "Tell me what to do"
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult {
        guard let slot = WidgetScheduleStore.load().freeSlot(at: Date()) else { throw FreeTimeError.unavailable }
        guard WidgetTaskControl.pending() == nil else { return .result() }
        let now = Date().timeIntervalSince1970
        let feedback = WidgetTaskFeedback(id: UUID().uuidString, task: slot, remainingMinutes: slot.remainingMinutes(at: Date()), done: false, reportedAt: now, kind: "fillFreeTime")
        WidgetTaskControl.defaults.set(try JSONEncoder().encode(feedback), forKey: "task-feedback")
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
    enum FreeTimeError: Error, LocalizedError {
        case unavailable
        var errorDescription: String? { "This button is available only during free time. Open Planner to refresh your schedule." }
    }
}

// Both the app and widget can use this App Group keychain item. Never put the session in defaults.
enum WidgetBackgroundDelivery {
    struct Credentials: Codable, Equatable { let token: String; let account: String; let origin: String }
    static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "PlannerWidgetDelivery", kSecAttrAccount as String: "session", kSecAttrAccessGroup as String: WidgetScheduleStore.group] }
    static func configure(token: String, account: String, origin: String) throws {
        let value = Credentials(token: token, account: account, origin: origin)
        if credentials() == value { return }
        clear()
        var item = query
        item[kSecValueData as String] = try JSONEncoder().encode(value)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw DeliveryError("Could not enable background widget delivery. Reopen Planner and try again.") }
    }
    static func credentials() -> Credentials? {
        var item = query; item[kSecReturnData as String] = true; item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
    static func request(_ path: String, credentials: Credentials, body: Data? = nil) async throws -> Data {
        guard let origin = URL(string: credentials.origin) else { throw DeliveryError("Reopen Planner to sign in.") }
        var request = URLRequest(url: origin.appendingPathComponent(path)); request.timeoutInterval = 20
        request.setValue("Bearer " + credentials.token, forHTTPHeaderField: "Authorization")
        if let body { request.httpMethod = "POST"; request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw DeliveryError("Could not confirm delivery. Your change is saved; check Main Chat in Planner before retrying.") }
        return data
    }
    @MainActor static func sendPending() async throws {
        guard let feedback = WidgetTaskControl.pending() else { return }
        guard let auth = credentials(), auth.account == WidgetTaskControl.defaults.string(forKey: "feedback-account") else { throw DeliveryError("Open Planner once to enable background delivery for your account. Your change is saved.") }
        let key = "widget-delivery:" + feedback.id
        guard WidgetTaskControl.defaults.string(forKey: key) == nil else { return }
        // Persist before POST. An ambiguous network response must never silently send a second job.
        WidgetTaskControl.defaults.set("attempted", forKey: key)
        _ = try await request("api/widget/feedback", credentials: auth, body: JSONEncoder().encode(feedback))
        guard credentials() == auth else { return }
        WidgetTaskControl.defaults.set("sent", forKey: key)
        if WidgetTaskControl.pending()?.id == feedback.id {
            WidgetTaskControl.defaults.removeObject(forKey: "task-feedback")
            WidgetTaskControl.defaults.removeObject(forKey: WidgetTaskControl.key(feedback.task))
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
    @MainActor private static var refreshing = false
    @MainActor private static var lastRefresh: (Credentials, Date)?
    @MainActor static func refresh() async {
        guard !refreshing else { return }
        guard let auth = credentials(), auth.account == WidgetTaskControl.defaults.string(forKey: "feedback-account") else { return }
        if let previous = lastRefresh, previous.0 == auth, Date().timeIntervalSince(previous.1) < 45 { return }
        refreshing = true
        defer { refreshing = false }
        do {
            let data = try await request("api/widget/snapshot", credentials: auth)
            guard credentials() == auth else { return }
            _ = try WidgetScheduleStore.save(WidgetSchedule.decode(data))
            lastRefresh = (auth, Date())
        } catch { /* Keep the offline schedule and pending preview. */ }
    }
    struct DeliveryError: LocalizedError { let message: String; init(_ message: String) { self.message = message }; var errorDescription: String? { message } }
}
