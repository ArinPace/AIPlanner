import Foundation
import AppIntents
import WidgetKit

struct WidgetTaskFeedback: Codable {
    let id: String
    let task: WidgetTask
    let remainingMinutes: Int
    let done: Bool
    let reportedAt: Double
    var requestedEnd: Double? = nil
    var kind: String? = nil
}
enum WidgetTaskControl {
    static var defaults: UserDefaults { UserDefaults(suiteName: WidgetScheduleStore.group)! }
    static func key(_ task: WidgetTask) -> String { "task-time:" + task.id }
    static func remaining(_ task: WidgetTask, now: Date = Date()) -> Int {
        task.remainingMinutes(at: now, adjustedEnd: defaults.object(forKey: key(task)) as? Double)
    }
    static func draftEnd(_ task: WidgetTask) -> Double {
        defaults.object(forKey: key(task)) as? Double ?? task.end
    }
    static func pending() -> WidgetTaskFeedback? {
        guard let data = defaults.data(forKey: "task-feedback") else { return nil }
        return try? JSONDecoder().decode(WidgetTaskFeedback.self, from: data)
    }
    static func adjust(_ task: WidgetTask, minutes: Int) {
        defaults.set(task.adjustedEnd(at: Date(), previous: defaults.object(forKey: key(task)) as? Double, delta: minutes), forKey: key(task))
    }
    static func submit(_ task: WidgetTask, done: Bool) throws {
        guard WidgetScheduleStore.load().current(at: Date())?.id == task.id else { throw ControlError.stale }
        guard defaults.data(forKey: "task-feedback") == nil else { return }
        let now = Date().timeIntervalSince1970
        let feedback = WidgetTaskFeedback(id: UUID().uuidString, task: task, remainingMinutes: done ? 0 : remaining(task), done: done, reportedAt: now, requestedEnd: done ? now : max(now, draftEnd(task)))
        defaults.set(try JSONEncoder().encode(feedback), forKey: "task-feedback")
        WidgetCenter.shared.reloadAllTimelines()
    }
    static func displaySchedule() -> WidgetSchedule {
        let schedule = WidgetScheduleStore.load()
        guard let pending = pending(), pending.done else { return schedule }
        return WidgetSchedule(version: schedule.version, generatedAt: schedule.generatedAt, validUntil: schedule.validUntil,
            events: schedule.events.compactMap { task in
                guard task.id == pending.task.id else { return task }
                guard pending.reportedAt > task.start else { return nil }
                return WidgetTask(id: task.id, title: task.title, start: task.start, end: min(task.end, pending.reportedAt), color: task.color, planningTaskId: task.planningTaskId)
            })
    }
    static func clear() {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix("task-time:") || key == "task-feedback" { defaults.removeObject(forKey: key) }
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
    func perform() async throws -> some IntentResult {
        guard let task = WidgetScheduleStore.load().current(at: Date()), task.id == taskID else { throw WidgetTaskControl.ControlError.stale }
        let step = task.adjustmentStep(remaining: WidgetTaskControl.remaining(task))
        WidgetTaskControl.adjust(task, minutes: minutes < 0 ? -step : step)
        return .result()
    }
}
struct SubmitTaskTimeIntent: AppIntent {
    static var title: LocalizedStringResource = "Send task feedback to Planner"
    static var openAppWhenRun: Bool = true
    @Parameter(title: "Task") var taskID: String
    @Parameter(title: "Done") var done: Bool
    init() {}
    init(task: WidgetTask, done: Bool) { self.taskID = task.id; self.done = done }
    @MainActor func perform() async throws -> some IntentResult {
        guard let task = WidgetScheduleStore.load().current(at: Date()), task.id == taskID else { throw WidgetTaskControl.ControlError.stale }
        try WidgetTaskControl.submit(task, done: done)
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
