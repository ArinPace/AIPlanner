import AuthenticationServices
import CryptoKit
import Foundation
import WebKit

@MainActor final class NativeAuthentication: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private weak var webView: WKWebView?
    init(webView: WKWebView) { self.webView = webView }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView?.window ?? ASPresentationAnchor()
    }
    func signIn() async throws {
        let verifier = try Self.randomToken()
        let state = try Self.randomToken()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        var url = URLComponents(url: AppConfiguration.origin.appendingPathComponent("api/auth/google/native/start"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "challenge", value: challenge), URLQueryItem(name: "state", value: state)]
        let result = try await authenticate(url.url!)
        let query = URLComponents(url: result, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard result.host == "auth", query.first(where: { $0.name == "state" })?.value == state else { throw NativeError("Sign-in response could not be verified.") }
        guard query.first(where: { $0.name == "status" })?.value == "success",
              let bridge = query.first(where: { $0.name == "bridge" })?.value else { throw NativeError("Google sign-in was cancelled or could not finish.") }
        var request = URLRequest(url: AppConfiguration.origin.appendingPathComponent("api/auth/google/native/redeem"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["bridge": bridge, "verifier": verifier])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
            let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw NativeError(message?["error"] as? String ?? "Sign-in expired. Try again.")
        }
        let headers = response.allHeaderFields.reduce(into: [String: String]()) { if let key = $1.key as? String { $0[key] = String(describing: $1.value) } }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: request.url!)
        guard let ticket = cookies.first(where: { $0.name == "planner-account-ticket" }), let webView else { throw NativeError("Could not transfer the verified sign-in to Planner.") }
        await webView.configuration.websiteDataStore.httpCookieStore.setCookie(ticket)
    }
    func connectGoogle(_ url: URL) async throws {
        guard url.scheme == "https", url.host == "accounts.google.com", let webView else { throw NativeError("Invalid Google connection URL.") }
        let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
        guard let cookie = cookies.first(where: { $0.name == "planner-oauth" && $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == AppConfiguration.origin.host }) else { throw NativeError("Connection expired. Try Connect again.") }
        let state = try Self.randomToken()
        var request = URLRequest(url: AppConfiguration.origin.appendingPathComponent("api/auth/native/connection/bootstrap"))
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["url": url.absoluteString, "browserToken": cookie.value, "state": state])
        let (data, response) = try await URLSession.shared.data(for: request)
        let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (response as? HTTPURLResponse)?.statusCode == 200, let raw = value?["url"] as? String, let start = URL(string: raw), AppConfiguration.isPlanner(start) else { throw NativeError(value?["error"] as? String ?? "Could not start Google connection.") }
        let result = try await authenticate(start)
        let query = URLComponents(url: result, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard result.host == "connection", query.first(where: { $0.name == "state" })?.value == state,
              query.first(where: { $0.name == "status" })?.value == "connected" else { throw NativeError("Google connection was cancelled or could not finish.") }
    }
    private func authenticate(_ url: URL) async throws -> URL {
        guard session == nil else { throw NativeError("A sign-in is already open.") }
        return try await withCheckedThrowingContinuation { continuation in
            let flow = ASWebAuthenticationSession(url: url, callbackURLScheme: AppConfiguration.callbackScheme) { [weak self] url, error in
                Task { @MainActor in
                    self?.session = nil
                    if let url { continuation.resume(returning: url) }
                    else { continuation.resume(throwing: error ?? NativeError("Sign-in was cancelled.")) }
                }
            }
            flow.presentationContextProvider = self
            flow.prefersEphemeralWebBrowserSession = false
            session = flow
            if !flow.start() { session = nil; continuation.resume(throwing: NativeError("Could not open secure sign-in.")) }
        }
    }
    private static func randomToken() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw NativeError("Could not start secure sign-in.") }
        return Data(bytes).base64URL
    }
}
struct NativeError: LocalizedError { let message: String; init(_ message: String) { self.message = message }; var errorDescription: String? { message } }
private extension Data { var base64URL: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") } }
