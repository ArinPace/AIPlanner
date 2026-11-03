import Foundation

struct WidgetTask: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let start: TimeInterval
    let end: TimeInterval
    var color: String? = nil
    var planningTaskId: String? = nil
    var isFreeTime: Bool? = nil
    var sourceEventId: String? = nil
    var startDate: Date { Date(timeIntervalSince1970: start) }
    var endDate: Date { Date(timeIntervalSince1970: end) }
    func remainingMinutes(at now: Date, adjustedEnd: Double? = nil) -> Int {
        max(0, Int(ceil(((adjustedEnd ?? end) - now.timeIntervalSince1970) / 60)))
    }
    func timerLeadingZero(at now: Date, adjustedEnd: Double? = nil) -> String {
        let seconds = max(0, Int((adjustedEnd ?? end) - now.timeIntervalSince1970))
        let leadingField = seconds >= 3600 ? seconds / 3600 : seconds / 60
        return leadingField < 10 ? "0" : ""
    }
    func adjustmentStep(remaining: Int) -> Int { remaining <= 30 ? 5 : 10 }
    func adjustedEnd(at now: Date, previous: Double?, delta: Int) -> Double {
        max(now.timeIntervalSince1970, max(now.timeIntervalSince1970, previous ?? end) + Double(delta * 60))
    }
}
struct WidgetSchedule: Codable, Equatable {
    let version: Int
    let generatedAt: TimeInterval
    let validUntil: TimeInterval
    let events: [WidgetTask]
    var resolvedFeedbackIds: [String]? = nil
    static let empty = WidgetSchedule(version: 1, generatedAt: 0, validUntil: 0, events: [])
    func current(at date: Date) -> WidgetTask? {
        let time = date.timeIntervalSince1970
        guard time < validUntil else { return nil }
        // A later, shorter activity takes precedence when fixed events overlap.
        return events.filter { $0.start <= time && time < $0.end }.sorted {
            if $0.start != $1.start { return $0.start > $1.start }
            if $0.end != $1.end { return $0.end < $1.end }
            return $0.id < $1.id
        }.first
    }
    func freeSlot(at date: Date) -> WidgetTask? {
        let time = date.timeIntervalSince1970
        guard generatedAt > 0, time >= generatedAt, time < validUntil else { return nil }
        let active = events.filter { $0.start <= time && time < $0.end }
        guard !active.contains(where: { $0.isFreeTime != true }) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        let dayStart = calendar.startOfDay(for: date)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return nil }
        let start = max(generatedAt, dayStart.timeIntervalSince1970, events.filter { $0.end <= time }.map(\.end).max() ?? generatedAt, active.map(\.start).max() ?? generatedAt)
        let end = min(validUntil, dayEnd.timeIntervalSince1970, events.filter { $0.isFreeTime != true && $0.start > time }.map(\.start).min() ?? validUntil, active.map(\.end).min() ?? validUntil)
        guard end > time else { return nil }
        return WidgetTask(id: "free-time:\(start):\(end)", title: "Free time", start: start, end: end, color: "#ffffff", isFreeTime: true)
    }
    func next(after date: Date) -> WidgetTask? {
        guard date.timeIntervalSince1970 < validUntil else { return nil }
        return events.filter { $0.start > date.timeIntervalSince1970 && $0.start < validUntil }.sorted { $0.start < $1.start }.first
    }
    func transitions(after now: Date) -> [Date] {
        let time = now.timeIntervalSince1970
        let limit = min(validUntil, time + 86400)
        var times: [Double] = [validUntil]
        for event in events { times.append(contentsOf: [event.start, event.end, event.end - 600 + 0.001, event.end - 3600 + 0.001, event.end - 36000 + 0.001]) }
        let selected = Set(times).filter { $0 > time && $0 <= limit }.sorted().prefix(96)
        return selected.map { Date(timeIntervalSince1970: $0) }
    }
    static func decode(_ data: Data) throws -> WidgetSchedule {
        let schedule = try JSONDecoder().decode(WidgetSchedule.self, from: data)
        guard schedule.version == 1, schedule.generatedAt.isFinite, schedule.validUntil.isFinite,
              schedule.validUntil >= schedule.generatedAt, schedule.validUntil - schedule.generatedAt <= 8 * 86400,
              schedule.events.count <= 10000,
              schedule.events.allSatisfy({ $0.start.isFinite && $0.end.isFinite && $0.end > $0.start && $0.title.count <= 300 && $0.id.count <= 500 }) else {
            throw NSError(domain: "PlannerWidgets", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid widget schedule."])
        }
        return schedule
    }
}
struct WidgetTaskFeedback: Codable {
    let id: String
    let task: WidgetTask
    let remainingMinutes: Int
    let done: Bool
    let reportedAt: Double
    var requestedEnd: Double? = nil
    var kind: String? = nil
}
// Widget-only previews survive delivery to the agent. They never write calendar events.
enum WidgetTimeOverrides {
    static let key = "widget-time-overrides"
    static var defaults: UserDefaults { UserDefaults(suiteName: WidgetScheduleStore.group)! }
    static func load() -> [String: WidgetTaskFeedback] {
        guard let data = defaults.data(forKey: key), let records = try? JSONDecoder().decode([String: WidgetTaskFeedback].self, from: data) else { return [:] }
        return records
    }
    static func save(_ records: [String: WidgetTaskFeedback]) {
        guard let data = try? JSONEncoder().encode(records) else { return }
        defaults.set(data, forKey: key)
    }
    static func store(_ feedback: WidgetTaskFeedback) {
        guard feedback.kind != "fillFreeTime" else { return }
        var records = load(); records[feedback.task.id] = feedback
        if records.count > 50 { records = Dictionary(uniqueKeysWithValues: records.sorted { $0.value.reportedAt > $1.value.reportedAt }.prefix(50).map { ($0.key, $0.value) }) }
        save(records)
    }
    static func source(_ task: WidgetTask) -> String { task.sourceEventId ?? String(task.id.split(separator: "@").first ?? Substring(task.id)) }
    static func matches(_ a: WidgetTask, _ b: WidgetTask) -> Bool { a.id == b.id || (source(a) == source(b) && abs(a.start - b.start) < 0.01) }
    static func record(for task: WidgetTask) -> WidgetTaskFeedback? { load().values.filter { matches($0.task, task) }.max { $0.reportedAt < $1.reportedAt } }
    static func end(_ feedback: WidgetTaskFeedback) -> Double { feedback.done ? feedback.reportedAt : feedback.requestedEnd ?? feedback.reportedAt + Double(feedback.remainingMinutes * 60) }
    static func task(_ original: WidgetTask, end: Double) -> WidgetTask {
        WidgetTask(id: original.id, title: original.title, start: original.start, end: max(original.start + 0.001, end), color: original.color, planningTaskId: original.planningTaskId, isFreeTime: original.isFreeTime, sourceEventId: original.sourceEventId)
    }
    static func applying(to schedule: WidgetSchedule) -> WidgetSchedule {
        let records = load().values
        var events = schedule.events.map { event in
            guard let change = records.filter({ matches($0.task, event) }).max(by: { $0.reportedAt < $1.reportedAt }) else { return event }
            return task(event, end: end(change))
        }
        for change in records where !events.contains(where: { matches($0, change.task) }) && end(change) > schedule.generatedAt {
            events.append(task(change.task, end: end(change)))
        }
        return WidgetSchedule(version: schedule.version, generatedAt: schedule.generatedAt, validUntil: schedule.validUntil, events: events)
    }
    static func preferred(in schedule: WidgetSchedule, at date: Date) -> WidgetTask? {
        let now = date.timeIntervalSince1970
        guard now < schedule.validUntil else { return nil }
        let records = load().values
        guard let change = records.filter({ $0.task.start <= now }).max(by: { $0.reportedAt < $1.reportedAt }) else { return nil }
        if change.done {
            let completed = records.filter(\.done)
            let remaining = WidgetSchedule(version: schedule.version, generatedAt: schedule.generatedAt, validUntil: schedule.validUntil,
                events: schedule.events.filter { event in !completed.contains(where: { matches($0.task, event) }) })
            return remaining.current(at: date) ?? remaining.next(after: date)
        }
        return task(change.task, end: end(change))
    }
    @discardableResult static func reconcile(with schedule: WidgetSchedule) -> Bool {
        var records = load()
        let count = records.count
        for (key, change) in records {
            let matching = schedule.events.first { matches($0, change.task) }
            let changed = matching.map { abs($0.end - change.task.end) > 0.01 || abs($0.end - end(change)) < 0.01 } ?? false
            let completed = change.done && matching == nil && schedule.generatedAt < change.task.end
            let merged = (schedule.resolvedFeedbackIds ?? []).contains(change.id)
            let legacyUpdate = schedule.resolvedFeedbackIds == nil && (changed || completed)
            if schedule.generatedAt >= change.reportedAt && (merged || legacyUpdate) { records.removeValue(forKey: key) }
        }
        if records.count != count { save(records); return true }
        return false
    }
    static func remove(_ requestId: String) {
        let records = load().filter { $0.value.id != requestId }
        save(records)
    }
    static func clear() { defaults.removeObject(forKey: key) }
}
enum WidgetScheduleStore {
    static let group = "group.com.arinpace.aiplanner"
    static var file: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("widget-schedule.json") }
    static func load() -> WidgetSchedule {
        guard let file, let data = try? Data(contentsOf: file), let schedule = try? WidgetSchedule.decode(data) else { return .empty }
        return schedule
    }
    @discardableResult static func save(_ schedule: WidgetSchedule) throws -> Bool {
        guard let file else { throw NSError(domain: "PlannerWidgets", code: 2, userInfo: [NSLocalizedDescriptionKey: "Enable the Planner App Group for both targets."]) }
        let overridesChanged = WidgetTimeOverrides.reconcile(with: schedule)
        let previous = load()
        if previous == schedule { return overridesChanged }
        // Repeated foreground reads need not request identical widget timelines.
        if schedule.generatedAt > 0, previous.events == schedule.events, previous.resolvedFeedbackIds == schedule.resolvedFeedbackIds, schedule.generatedAt - previous.generatedAt < 1800, previous.validUntil > Date().timeIntervalSince1970 + 3600 { return overridesChanged }
        try JSONEncoder().encode(schedule).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return true
    }
}
