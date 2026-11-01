import Foundation

struct WidgetTask: Codable, Equatable {
    let id: String
    let title: String
    let start: TimeInterval
    let end: TimeInterval
    var startDate: Date { Date(timeIntervalSince1970: start) }
    var endDate: Date { Date(timeIntervalSince1970: end) }
}
struct WidgetSchedule: Codable, Equatable {
    let version: Int
    let generatedAt: TimeInterval
    let validUntil: TimeInterval
    let events: [WidgetTask]
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
    func next(after date: Date) -> WidgetTask? {
        guard date.timeIntervalSince1970 < validUntil else { return nil }
        return events.filter { $0.start > date.timeIntervalSince1970 && $0.start < validUntil }.sorted { $0.start < $1.start }.first
    }
    func transitions(after now: Date) -> [Date] {
        let time = now.timeIntervalSince1970
        let limit = min(validUntil, time + 86400)
        return Array(Set(events.flatMap { [$0.start, $0.end] } + [validUntil]))
            .filter { $0 > time && $0 <= limit }.sorted().prefix(96).map { Date(timeIntervalSince1970: $0) }
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
enum WidgetScheduleStore {
    static let group = "group.com.arinpace.aiplanner"
    static var file: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("widget-schedule.json") }
    static func load() -> WidgetSchedule {
        guard let file, let data = try? Data(contentsOf: file), let schedule = try? WidgetSchedule.decode(data) else { return .empty }
        return schedule
    }
    @discardableResult static func save(_ schedule: WidgetSchedule) throws -> Bool {
        guard let file else { throw NSError(domain: "PlannerWidgets", code: 2, userInfo: [NSLocalizedDescriptionKey: "Enable the Planner App Group for both targets."]) }
        if load() == schedule { return false }
        try JSONEncoder().encode(schedule).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return true
    }
}
