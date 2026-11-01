import SwiftUI
import WidgetKit

struct PlannerEntry: TimelineEntry {
    let date: Date
    let schedule: WidgetSchedule
    var task: WidgetTask? { schedule.current(at: date) }
    var next: WidgetTask? { schedule.next(after: date) }
}
struct PlannerProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlannerEntry {
        let now = Date()
        return PlannerEntry(date: now, schedule: WidgetSchedule(version: 1, generatedAt: now.timeIntervalSince1970, validUntil: now.addingTimeInterval(86400).timeIntervalSince1970, events: [WidgetTask(id: "preview", title: "Example task", start: now.addingTimeInterval(-900).timeIntervalSince1970, end: now.addingTimeInterval(1800).timeIntervalSince1970)]))
    }
    func getSnapshot(in context: Context, completion: @escaping (PlannerEntry) -> Void) {
        let schedule = WidgetScheduleStore.load()
        completion(context.isPreview && schedule.validUntil <= Date().timeIntervalSince1970 ? placeholder(in: context) : PlannerEntry(date: Date(), schedule: schedule))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PlannerEntry>) -> Void) {
        let now = Date(), schedule = WidgetScheduleStore.load()
        let dates = [now] + schedule.transitions(after: now)
        let entries = dates.map { PlannerEntry(date: $0, schedule: schedule) }
        // Entries switch at task boundaries; the countdown ticks without reloads.
        let refresh = min(now.addingTimeInterval(3600), dates.last ?? now.addingTimeInterval(3600))
        completion(Timeline(entries: entries, policy: .after(max(now.addingTimeInterval(900), refresh))))
    }
}
struct PlannerWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: PlannerEntry
    let countdown: Bool
    var combined = false
    private var isHome: Bool { family == .systemSmall || family == .systemMedium }
    private var taskHex: String { entry.task?.color ?? "#1a73e8" }
    private var taskColor: Color {
        let value = UInt64(taskHex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x1a73e8
        return Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
    private var colored: Bool { isHome && (combined || !countdown) && entry.task != nil }
    private var taskTextColor: Color {
        let value = UInt64(taskHex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x1a73e8
        let luminance = (0.299 * Double((value >> 16) & 255) + 0.587 * Double((value >> 8) & 255) + 0.114 * Double(value & 255)) / 255
        return luminance > 0.65 ? Color(red: 0.125, green: 0.13, blue: 0.14) : .white
    }
    @ViewBuilder private func countdownText(_ task: WidgetTask) -> some View {
        if #available(iOS 18.0, *) {
            Text(.currentDate, format: .timer(countingDownIn: task.startDate..<task.endDate, maxPrecision: .seconds(1)))
        } else {
            Text(task.endDate, style: .timer)
        }
    }
    var body: some View {
        Group {
            if family == .accessoryInline {
                if let task = entry.task {
                    if countdown { countdownText(task).monospacedDigit() }
                    else { Label(task.title, systemImage: "calendar").privacySensitive() }
                } else { Text("No current task") }
            } else if family == .accessoryCircular {
                if let task = entry.task {
                    VStack(spacing: 1) {
                        Image(systemName: "hourglass")
                        countdownText(task).font(.caption).monospacedDigit()
                    }
                } else { Image(systemName: "calendar") }
            } else {
                VStack(alignment: .leading, spacing: isHome ? (combined ? 5 : 8) : 2) {
                    if !combined || isHome { Label(combined ? "Now" : countdown ? "Time remaining" : "Current task", systemImage: countdown && !combined ? "hourglass" : "calendar")
                        .font(isHome ? .caption : .caption2).foregroundStyle(colored ? taskTextColor.opacity(0.85) : Color.secondary) }
                    if let task = entry.task {
                        if combined {
                            Text(task.title).privacySensitive().font(isHome ? .headline : .caption).lineLimit(isHome ? 2 : 1)
                            Text("\(task.startDate.formatted(date: .omitted, time: .shortened)) – \(task.endDate.formatted(date: .omitted, time: .shortened))").font(.caption2).foregroundStyle(colored ? taskTextColor.opacity(0.85) : Color.secondary).lineLimit(1)
                            if isHome { Spacer(minLength: 2) }
                            countdownText(task).font(isHome ? .system(size: 28, weight: .semibold, design: .rounded) : .title3).monospacedDigit().lineLimit(1)
                        } else if countdown {
                            countdownText(task)
                                .font(isHome ? .system(size: 34, weight: .semibold, design: .rounded) : .title3)
                                .monospacedDigit().lineLimit(1)
                            Text(task.title).privacySensitive().font(.caption).lineLimit(isHome ? 2 : 1)
                        } else {
                            Text(task.title).privacySensitive().font(isHome ? .headline : .body).lineLimit(isHome ? 4 : 2)
                            if isHome { Text("\(task.startDate.formatted(date: .omitted, time: .shortened)) – \(task.endDate.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(colored ? taskTextColor.opacity(0.85) : Color.secondary) }
                        }
                    } else if entry.date.timeIntervalSince1970 >= entry.schedule.validUntil {
                        Text("Open Planner to sync").font(.headline)
                    } else {
                        Text("No current task").font(.headline)
                        if isHome, let next = entry.next {
                            Text("Next: \(next.title)").font(.caption).lineLimit(2)
                            Text(next.startDate, style: .time).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if isHome { Spacer(minLength: 0) }
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .foregroundStyle(colored ? taskTextColor : Color.primary)
        .containerBackground(for: .widget) { if colored { taskColor } else { Color(.systemBackground) } }
        .widgetURL(URL(string: "aiplanner://calendar"))
    }
}
struct CurrentTaskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PlannerCurrentTask", provider: PlannerProvider()) { PlannerWidgetView(entry: $0, countdown: false) }
            .configurationDisplayName("Current Task")
            .description("The activity scheduled right now.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}
struct TimeRemainingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PlannerTimeRemaining", provider: PlannerProvider()) { PlannerWidgetView(entry: $0, countdown: true) }
            .configurationDisplayName("Time Remaining")
            .description("A live countdown to the end of your current activity.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}
struct TaskAndTimeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PlannerTaskAndTime", provider: PlannerProvider()) { PlannerWidgetView(entry: $0, countdown: true, combined: true) }
            .configurationDisplayName("Task & Time")
            .description("Your current activity and live countdown in one small widget.")
            .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}
@main struct PlannerWidgetBundle: WidgetBundle {
    var body: some Widget { TaskAndTimeWidget(); CurrentTaskWidget(); TimeRemainingWidget() }
}
