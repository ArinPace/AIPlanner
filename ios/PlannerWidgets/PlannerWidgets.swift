import SwiftUI
import WidgetKit
import AppIntents

struct PlannerEntry: TimelineEntry {
    let date: Date
    let schedule: WidgetSchedule
    var task: WidgetTask? { WidgetTimeOverrides.preferred(in: schedule, at: date) ?? schedule.current(at: date) }
    var next: WidgetTask? { schedule.next(after: date) }
}
struct PlannerProvider: TimelineProvider {
    func placeholder(in context: Context) -> PlannerEntry {
        let now = Date()
        return PlannerEntry(date: now, schedule: WidgetSchedule(version: 1, generatedAt: now.timeIntervalSince1970, validUntil: now.addingTimeInterval(86400).timeIntervalSince1970, events: [WidgetTask(id: "preview", title: "Example task", start: now.addingTimeInterval(-900).timeIntervalSince1970, end: now.addingTimeInterval(1800).timeIntervalSince1970)]))
    }
    func getSnapshot(in context: Context, completion: @escaping (PlannerEntry) -> Void) {
        let schedule = WidgetTaskControl.displaySchedule()
        completion(context.isPreview && schedule.validUntil <= Date().timeIntervalSince1970 ? placeholder(in: context) : PlannerEntry(date: Date(), schedule: schedule))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PlannerEntry>) -> Void) {
        let now = Date(), schedule = WidgetTaskControl.displaySchedule()
        let draftTransitions = schedule.events.filter { abs(WidgetTaskControl.draftEnd($0) - $0.end) > 0.001 }.flatMap { task in
            [600.0, 3600.0, 36000.0].map { Date(timeIntervalSince1970: WidgetTaskControl.draftEnd(task) - $0 + 0.001) }
        }.filter { $0 > now && $0.timeIntervalSince1970 <= schedule.validUntil }
        let dates = Array(Set([now] + schedule.transitions(after: now) + WidgetScheduleStore.load().transitions(after: now) + draftTransitions)).sorted()
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
        StaticConfiguration(kind: "PlannerTaskAndTime", provider: PlannerProvider()) { TaskControlView(combined: true, entry: $0) }
            .configurationDisplayName("Task & Time")
            .description("Current activity, start/end time and live countdown. Adjust with plus/minus, then tap the countdown to apply.")
            .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}
struct TaskControlWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PlannerTaskControl", provider: PlannerProvider()) { TaskControlView(entry: $0) }
        .configurationDisplayName("Adjust Task")
        .description("Use plus/minus to adjust time in 5- or 10-minute steps, then tap the countdown to apply. Use the separate Done widget to finish.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
struct TaskControlView: View {
    var combined = false
    @Environment(\.widgetFamily) var family
    let entry: PlannerEntry
    private var home: Bool { family == .systemSmall || family == .systemMedium }
    private var task: WidgetTask? {
        let pending = WidgetTaskControl.pending()
        return pending?.done == true ? pending?.task : entry.task ?? pending?.task ?? WidgetTimeOverrides.load().values.max(by: { $0.reportedAt < $1.reportedAt })?.task
    }
    private var hex: UInt64 { UInt64((task?.color ?? "#1a73e8").trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x1a73e8 }
    private var background: Color { Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255) }
    private var ink: Color {
        guard home, task != nil else { return .primary }
        return (0.299 * Double((hex >> 16) & 255) + 0.587 * Double((hex >> 8) & 255) + 0.114 * Double(hex & 255)) / 255 > 0.65 ? .black : .white
    }
    var body: some View {
        VStack(alignment: .leading, spacing: home ? 6 : 2) {
            if let task {
                let feedback = WidgetTaskControl.pending()
                let pending = feedback != nil || !WidgetTimeOverrides.load().isEmpty
                let change = feedback ?? WidgetTimeOverrides.record(for: task)
                let end = change.flatMap { $0.done ? $0.reportedAt : nil } ?? WidgetTaskControl.draftEnd(task)
                Text(task.title).font(home ? .subheadline.weight(.semibold) : .caption).lineLimit(home ? 2 : 1)
                if home {
                    Text("\(task.startDate.formatted(date: .omitted, time: .shortened)) – \(Date(timeIntervalSince1970: end).formatted(date: .omitted, time: .shortened))")
                        .font(.caption2).lineLimit(1).minimumScaleFactor(0.7)
                }
                HStack(spacing: home ? 8 : 6) {
                    Button(intent: AdjustTaskTimeIntent(task: task, minutes: -1)) {
                        Image(systemName: "minus").frame(width: home ? 24 : 20, height: 30)
                            .background(ink.opacity(0.16), in: RoundedRectangle(cornerRadius: 9))
                    }.foregroundStyle(pending ? Color.gray : ink).opacity(pending ? 0.45 : 1)
                    .accessibilityLabel(combined ? "Decrease task time" : "Decrease remaining time")
                    Button(intent: SubmitTaskTimeIntent(task: task, done: false)) {
                        if end > Date().timeIntervalSince1970 {
                            let timer = Text(timerInterval: Date(timeIntervalSince1970: min(task.start, entry.date.timeIntervalSince1970))...Date(timeIntervalSince1970: end), countsDown: true, showsHours: true)
                            Text("\(Text(task.timerLeadingZero(at: entry.date, adjustedEnd: end)))\(timer)")
                                .monospacedDigit().multilineTextAlignment(.center)
                        } else { Text("00:00") }
                    }
                    .buttonStyle(.bordered).controlSize(.mini)
                    .accessibilityLabel("Apply remaining time").accessibilityValue("\(WidgetTaskControl.remaining(task))")
                        .accessibilityIdentifier(combined ? "combinedTaskTimeValue" : "taskTimeValue")
                        .font(home ? .headline : .caption).lineLimit(1).minimumScaleFactor(0.6)
                        .frame(maxWidth: .infinity, minHeight: 30).layoutPriority(1)
                    Button(intent: AdjustTaskTimeIntent(task: task, minutes: 1)) {
                        Image(systemName: "plus").frame(width: home ? 24 : 20, height: 30)
                            .background(ink.opacity(0.16), in: RoundedRectangle(cornerRadius: 9))
                    }.foregroundStyle(pending ? Color.gray : ink).opacity(pending ? 0.45 : 1)
                    .accessibilityLabel(combined ? "Increase task time" : "Increase remaining time")

                }.buttonStyle(.plain).disabled(pending)
                if home {
                    if pending {
                        Text("Sending…").font(.caption2)
                    } else {
                        Text("Tap time to apply").font(.caption2).opacity(0.85)
                    }
                }
            } else {
                Text("No current task").font(.headline)
                Link("Open Planner to sync", destination: URL(string: "aiplanner://calendar")!).font(.caption)
            }
        }
        .foregroundStyle(ink).tint(ink)
        .containerBackground(for: .widget) { if home, task != nil { background } else { Color(.systemBackground) } }
    }
}
struct DoneTaskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PlannerDoneTask", provider: PlannerProvider()) { DoneTaskView(entry: $0) }
            .configurationDisplayName("Done")
            .description("End your current activity immediately and ask the agent to adjust the remaining schedule.")
            .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}
struct DoneTaskView: View {
    @Environment(\.widgetFamily) var family
    let entry: PlannerEntry
    private var pending: WidgetTaskFeedback? { WidgetTaskControl.pending() }
    private var task: WidgetTask? { pending?.done == true ? pending?.task : entry.task }
    private var hex: UInt64 { UInt64((task?.color ?? "#1a73e8").trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x1a73e8 }
    private var color: Color { Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255) }
    private var ink: Color { family != .systemSmall ? .primary : (0.299 * Double((hex >> 16) & 255) + 0.587 * Double((hex >> 8) & 255) + 0.114 * Double(hex & 255)) / 255 > 0.65 ? .black : .white }
    var body: some View {
        VStack(spacing: 8) {
            if let task {
                if family != .accessoryCircular { Text(task.title).font(.headline).lineLimit(2) }
                if pending?.done == true {
                    Label("Finished · syncing", systemImage: "checkmark.circle.fill").font(.caption)
                } else {
                    Button(intent: SubmitTaskTimeIntent(task: task, done: true)) {
                        if family == .accessoryCircular {
                            Image(systemName: "checkmark.circle.fill").font(.title2)
                        } else {
                            Label("Done", systemImage: "checkmark.circle.fill")
                                .font(family == .systemSmall ? .title2.weight(.semibold) : .caption)
                        }
                    }.buttonStyle(.bordered).disabled(pending != nil).accessibilityLabel("Finish current task")
                }
            } else {
                Label("No current task", systemImage: "checkmark.circle").font(.caption)
            }
        }.foregroundStyle(ink).tint(ink)
        .containerBackground(for: .widget) { if family == .systemSmall, task != nil { color } else { Color(.systemBackground) } }
    }
}
struct FillFreeTimeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PlannerFillFreeTime", provider: PlannerProvider()) { FillFreeTimeView(entry: $0) }
            .configurationDisplayName("Tell me what to do")
            .description("During free time, ask your agent to choose and schedule something useful before your next commitment.")
            .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular])
    }
}
struct FillFreeTimeView: View {
    @Environment(\.widgetFamily) var family
    let entry: PlannerEntry
    private var slot: WidgetTask? { WidgetScheduleStore.load().freeSlot(at: entry.date) }
    @ViewBuilder private var actionLabel: some View {
        if family == .accessoryCircular { Image(systemName: "sparkles").font(.title2) }
        else {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                Text("Tell me what to do").font(.system(size: family == .systemSmall ? 15 : 12, weight: .semibold))
                    .lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, minHeight: family == .systemSmall ? 40 : 0)
        }
    }
    var body: some View {
        let pending = WidgetTaskControl.pending()
        VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 2) {
            if family == .systemSmall { Text("Free time").font(.headline) }
            if slot != nil && pending == nil {
                Button(intent: FillFreeTimeIntent()) { actionLabel }
                    .buttonStyle(.bordered).controlSize(family == .systemSmall ? .regular : .mini).tint(.primary)
                    .accessibilityLabel("Fill my free time")
            } else {
                actionLabel.foregroundStyle(.secondary).opacity(0.6)
                    .accessibilityIdentifier("freeTimeUnavailable")
            }
            if family != .accessoryCircular {
                if pending?.kind == "fillFreeTime" { Text("Request saved · sending…").font(.caption) }
                else if let slot { Text("Free until \(slot.endDate.formatted(date: .omitted, time: .shortened))").font(.caption) }
                else { Text(entry.schedule.validUntil <= entry.date.timeIntervalSince1970 ? "Open Planner to sync" : "Available during free time").font(.caption) }
            }
        }.foregroundStyle(.primary)
        .containerBackground(for: .widget) { Color(.systemBackground) }
    }
}

@main struct PlannerWidgetBundle: WidgetBundle {
    var body: some Widget { FillFreeTimeWidget(); TaskControlWidget(); DoneTaskWidget(); TaskAndTimeWidget(); CurrentTaskWidget(); TimeRemainingWidget() }
}
