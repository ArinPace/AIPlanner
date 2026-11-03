// Run with: swiftc ios/Shared/WidgetSchedule.swift ios/Shared/WidgetScheduleTests.swift -o /tmp/planner-widget-tests && /tmp/planner-widget-tests
import Foundation
@main enum WidgetScheduleTests {
    static func main() throws {
        let tasks = [WidgetTask(id: "first", title: "First task", start: 100, end: 200), WidgetTask(id: "second", title: "Second task", start: 200, end: 300), WidgetTask(id: "overlap", title: "Specific activity", start: 220, end: 240)]
        let schedule = WidgetSchedule(version: 1, generatedAt: 90, validUntil: 400, events: tasks)
        func date(_ seconds: Double) -> Date { Date(timeIntervalSince1970: seconds) }
        precondition(schedule.current(at: date(99)) == nil)
        precondition(schedule.current(at: date(100))?.id == "first")
        precondition(schedule.current(at: date(200))?.id == "second")
        precondition(schedule.current(at: date(220))?.id == "overlap")
        precondition(schedule.current(at: date(240))?.id == "second")
        precondition(schedule.current(at: date(300)) == nil)
        precondition(schedule.current(at: date(400)) == nil)
        precondition(schedule.next(after: date(99))?.id == "first")
        precondition(schedule.transitions(after: date(199)).map(\.timeIntervalSince1970) == [200,220,240,300,400])
        let timed = tasks[0]
        precondition(timed.remainingMinutes(at: date(140)) == 1)
        precondition(timed.remainingMinutes(at: date(201)) == 0)
        precondition(timed.adjustedEnd(at: date(141), previous: nil, delta: 5) == 500)
        let plus = timed.adjustedEnd(at: date(140), previous: nil, delta: 5)
        precondition(timed.remainingMinutes(at: date(140), adjustedEnd: plus) == 6)
        let minus = timed.adjustedEnd(at: date(140), previous: plus, delta: -10)
        precondition(timed.remainingMinutes(at: date(140), adjustedEnd: minus) == 0)
        precondition(timed.adjustedEnd(at: date(140), previous: minus, delta: -5) == 140)
        precondition(timed.remainingMinutes(at: date(200), adjustedEnd: plus) == 5)
        precondition(timed.adjustmentStep(remaining: 0) == 5)
        precondition(timed.adjustmentStep(remaining: 30) == 5)
        precondition(timed.adjustmentStep(remaining: 31) == 10)
        precondition(timed.adjustmentStep(remaining: 90) == 10)
        precondition(schedule.freeSlot(at: date(95))?.end == 100)
        precondition(schedule.freeSlot(at: date(100)) == nil)
        precondition(schedule.freeSlot(at: date(220)) == nil)
        precondition(schedule.freeSlot(at: date(300))?.end == 400)
        precondition(schedule.freeSlot(at: date(400)) == nil)
        precondition(schedule.freeSlot(at: date(89)) == nil)
        let free = WidgetTask(id: "free", title: "Free time", start: 100, end: 200, isFreeTime: true)
        let freeSchedule = WidgetSchedule(version: 1, generatedAt: 90, validUntil: 400, events: [free])
        precondition(freeSchedule.freeSlot(at: date(150))?.end == 200)
        let overlapFree = WidgetSchedule(version: 1, generatedAt: 90, validUntil: 400, events: [free, tasks[0]])
        precondition(overlapFree.freeSlot(at: date(150)) == nil)
        precondition(WidgetSchedule.empty.freeSlot(at: Date()) == nil)
        precondition(timed.timerLeadingZero(at: date(140)) == "0")
        precondition(timed.timerLeadingZero(at: date(200)) == "0")
        precondition(timed.timerLeadingZero(at: date(0), adjustedEnd: 599) == "0")
        precondition(timed.timerLeadingZero(at: date(0), adjustedEnd: 600) == "")
        precondition(timed.timerLeadingZero(at: date(0), adjustedEnd: 3599) == "")
        precondition(timed.timerLeadingZero(at: date(0), adjustedEnd: 3600) == "0")
        precondition(timed.timerLeadingZero(at: date(0), adjustedEnd: 36000) == "")
        let decoded = try WidgetSchedule.decode(JSONEncoder().encode(schedule))
        precondition(decoded == schedule)
        let invalid = WidgetSchedule(version: 1, generatedAt: 0, validUntil: 400, events: [WidgetTask(id: "bad", title: "Bad", start: 20, end: 10)])
        do { _ = try WidgetSchedule.decode(JSONEncoder().encode(invalid)); preconditionFailure("Invalid times accepted") } catch { }
        precondition(WidgetSchedule.empty.current(at: Date()) == nil)
        let savedOverrides = WidgetTimeOverrides.defaults.data(forKey: WidgetTimeOverrides.key)
        defer { WidgetTimeOverrides.defaults.set(savedOverrides, forKey: WidgetTimeOverrides.key) }
        WidgetTimeOverrides.clear()
        let preview = WidgetTaskFeedback(id: "preview-request", task: tasks[0], remainingMinutes: 3, done: false, reportedAt: 150, requestedEnd: 330)
        WidgetTimeOverrides.store(preview)
        let unchanged = WidgetSchedule(version: 1, generatedAt: 160, validUntil: 400, events: tasks)
        precondition(!WidgetTimeOverrides.reconcile(with: unchanged))
        precondition(unchanged.events[0].end == 200) // Live data stays intact.
        precondition(WidgetTimeOverrides.preferred(in: unchanged, at: date(250))?.end == 330)
        let missing = WidgetSchedule(version: 1, generatedAt: 210, validUntil: 400, events: [])
        precondition(!WidgetTimeOverrides.reconcile(with: missing)) // Original slot passed while draft is pending.
        precondition(WidgetTimeOverrides.applying(to: missing).current(at: date(250))?.end == 330)
        precondition(WidgetTimeOverrides.preferred(in: unchanged, at: date(350))?.end == 330) // Zero remains editable until the plan is committed.
        precondition(timed.adjustedEnd(at: date(350), previous: 330, delta: 5) == 650)
        let partial = WidgetSchedule(version: 1, generatedAt: 215, validUntil: 400, events: [WidgetTimeOverrides.task(tasks[0], end: 330)], resolvedFeedbackIds: [])
        precondition(!WidgetTimeOverrides.reconcile(with: partial)) // A single event edit is not a merged full plan.
        precondition(!WidgetTimeOverrides.load().isEmpty)
        let published = WidgetSchedule(version: 1, generatedAt: 220, validUntil: 400, events: tasks, resolvedFeedbackIds: [preview.id])
        precondition(WidgetTimeOverrides.reconcile(with: published)) // A full plan may choose another coherent allocation.
        precondition(WidgetTimeOverrides.load().isEmpty)
        let finished = WidgetTaskFeedback(id: "done-request", task: tasks[0], remainingMinutes: 0, done: true, reportedAt: 150, requestedEnd: 150)
        WidgetTimeOverrides.store(finished)
        precondition(WidgetTimeOverrides.preferred(in: unchanged, at: date(160))?.id == "second") // Immediately preview the next scheduled activity.
        precondition(WidgetTimeOverrides.preferred(in: unchanged, at: date(230))?.id == "overlap") // Prefer an already active overlapping activity.
        precondition(WidgetTimeOverrides.preferred(in: unchanged, at: date(350)) == nil)
        precondition(!WidgetTimeOverrides.reconcile(with: WidgetSchedule(version: 1, generatedAt: 170, validUntil: 400, events: tasks, resolvedFeedbackIds: [])))
        precondition(WidgetTimeOverrides.load().values.contains(where: \.done)) // Delivery alone never unlocks Done.
        precondition(WidgetTimeOverrides.reconcile(with: WidgetSchedule(version: 1, generatedAt: 180, validUntil: 400, events: tasks, resolvedFeedbackIds: [finished.id])))
        precondition(!WidgetTimeOverrides.load().values.contains(where: \.done))
        print("Widget schedule checks passed: boundaries, overlaps, expiry, next task, timeline and payload validation.")
    }
}
