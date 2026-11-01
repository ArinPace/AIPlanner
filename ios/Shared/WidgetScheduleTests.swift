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
        let decoded = try WidgetSchedule.decode(JSONEncoder().encode(schedule))
        precondition(decoded == schedule)
        let invalid = WidgetSchedule(version: 1, generatedAt: 0, validUntil: 400, events: [WidgetTask(id: "bad", title: "Bad", start: 20, end: 10)])
        do { _ = try WidgetSchedule.decode(JSONEncoder().encode(invalid)); preconditionFailure("Invalid times accepted") } catch { }
        precondition(WidgetSchedule.empty.current(at: Date()) == nil)
        print("Widget schedule checks passed: boundaries, overlaps, expiry, next task, timeline and payload validation.")
    }
}
