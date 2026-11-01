import Foundation

struct AppConfiguration {
    static let callbackScheme = "aiplanner"
    static let production = URL(string: "https://aiplanner-ten.vercel.app")!
    static var origin: URL {
        #if DEBUG
        if let value = ProcessInfo.processInfo.environment["AI_PLANNER_TEST_ORIGIN"],
           let url = URL(string: value), ["127.0.0.1", "localhost"].contains(url.host ?? "") {
            return url
        }
        #endif
        return production
    }
    static func isPlanner(_ url: URL) -> Bool {
        url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }
}
