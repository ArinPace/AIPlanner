import Foundation
import AppIntents
import WidgetKit

struct WidgetTaskFeedback: Codable {
    let id: String
    let task: WidgetTask
    let remainingMinutes: Int
    let done: Bool
    let reportedAt: Double
}
enum WidgetTaskControl {
    static var defaults: UserDefaults { UserDefaults(suiteName: WidgetScheduleStore.group)! }
    static func key(_ task: WidgetTask) -> String { "task-time:" + task.id }
    static func remaining(_ task: WidgetTask, now: Date = Date()) -> Int {
        task.remainingMinutes(at: now, adjustedEnd: defaults.object(forKey: key(task)) as? Double)
    }
    static func adjust(_ task: WidgetTask, minutes: Int) {
        defaults.set(task.adjustedEnd(at: Date(), previous: defaults.object(forKey: key(task)) as? Double, delta: minutes), forKey: key(task))
    }
    static func submit(_ task: WidgetTask, done: Bool) throws {
        guard WidgetScheduleStore.load().current(at: Date())?.id == task.id else { throw ControlError.stale }
        guard defaults.data(forKey: "task-feedback") == nil else { return }
        let feedback = WidgetTaskFeedback(id: UUID().uuidString, task: task, remainingMinutes: done ? 0 : remaining(task), done: done, reportedAt: Date().timeIntervalSince1970)
        defaults.set(try JSONEncoder().encode(feedback), forKey: "task-feedback")
        WidgetCenter.shared.reloadAllTimelines()
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
        WidgetTaskControl.adjust(task, minutes: minutes < 0 ? -5 : 5)
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
