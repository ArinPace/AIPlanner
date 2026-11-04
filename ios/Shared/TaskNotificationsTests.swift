import Foundation
@main struct TaskNotificationsTests {
    static func main() {
        let task = WidgetTask(id: "homework", title: "Homework", start: 1000, end: 4600)
        let next = WidgetTask(id: "class", title: "Class", start: 4600, end: 8200)
        let schedule = WidgetSchedule(version: 1, generatedAt: 1000, validUntil: 10000, events: [task, next])
        var options = TaskNotificationOptions(); options.enabled = true; options.minutes = [30, 10, 5]
        let plan = TaskNotificationPlan.make(schedule: schedule, options: options, now: 1001)
        precondition(plan.filter { $0.body == "Homework" }.map(\.at) == [2800, 4000, 4300])
        precondition(plan.filter { $0.at == 4600 }.count == 1)
        precondition(plan.first { $0.at == 4600 }!.body.contains("Now: Class"))
        options.enabled = false
        precondition(TaskNotificationPlan.make(schedule: schedule, options: options, now: 1001).isEmpty)
        options.enabled = true
        let short = WidgetSchedule(version: 1, generatedAt: 1, validUntil: 10000, events: [WidgetTask(id: "short", title: "Short", start: 0, end: 1200)])
        precondition(!TaskNotificationPlan.make(schedule: short, options: options, now: 1).contains { $0.id.hasPrefix("advance:") })
        let free = WidgetSchedule(version: 1, generatedAt: 1, validUntil: 10000, events: [WidgetTask(id: "free", title: "Free time", start: 0, end: 7200, isFreeTime: true)])
        precondition(!TaskNotificationPlan.make(schedule: free, options: options, now: 1).contains { $0.id.hasPrefix("advance:") })
        options.minutes = [60]; options.longTaskMinutes = 1
        precondition(!TaskNotificationPlan.make(schedule: schedule, options: options, now: 1001).contains { $0.body == "Homework" && $0.id.hasPrefix("advance:") })
        print("Task notification plan tests passed")
    }
}
