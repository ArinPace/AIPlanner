import Foundation

enum LocalReplicaStore {
    private static var file: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Planner Local Copy", isDirectory: true).appendingPathComponent("replica.json")
    }
    private static func load() -> [String: Any] {
        guard let data = try? Data(contentsOf: file), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return value
    }
    @discardableResult static func activate(_ account: String?) throws -> Bool {
        let previous = load()["account"] as? String
        guard account != previous || account == nil else { return false }
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
        if let account { try write(["version": 1, "account": account, "parts": [:]]) }
        return true
    }
    static func save(account: String, kind: String, savedAt: Double, payload: Any) throws {
        guard ["calendar", "files"].contains(kind), savedAt.isFinite, !account.isEmpty else { throw NativeError("Invalid local copy.") }
        var copy = load()
        guard copy["account"] as? String == account else { throw NativeError("Local copy account changed. Reopen Planner to sync.") }
        var parts = copy["parts"] as? [String: Any] ?? [:]
        if let old = parts[kind] as? [String: Any], let oldData = old["data"] as? [String: Any], let data = payload as? [String: Any], let oldRevision = oldData["revision"] as? Int, let revision = data["revision"] as? Int, revision < oldRevision { return }
        parts[kind] = ["savedAt": savedAt, "data": payload]
        copy["parts"] = parts
        try write(copy)
    }
    private static func write(_ value: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard data.count <= 40 * 1024 * 1024 else { throw NativeError("Local copy exceeds 40 MB.") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
    }
}
