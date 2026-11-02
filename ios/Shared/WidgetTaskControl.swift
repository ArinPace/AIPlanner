import Foundation
import AppIntents
import WidgetKit

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
        defaults.set(task.adjustedEnd(at: Date(), previous: draftEnd(task), delta: minutes), forKey: key(task))
    }
    static func submit(_ task: WidgetTask, done: Bool) throws {
        guard currentTask(at: Date())?.id == task.id else { throw ControlError.stale }
        guard defaults.data(forKey: "task-feedback") == nil else { return }
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
        WidgetTimeOverrides.clear()
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
        guard let task = WidgetTaskControl.currentTask(at: Date()), task.id == taskID else { throw WidgetTaskControl.ControlError.stale }
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
        guard let task = WidgetTaskControl.currentTask(at: Date()), task.id == taskID else { throw WidgetTaskControl.ControlError.stale }
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
