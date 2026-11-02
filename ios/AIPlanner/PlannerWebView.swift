import SwiftUI
import WebKit
import WidgetKit

struct PlannerWebView: UIViewRepresentable {
    @ObservedObject var model: PlannerModel
    func makeCoordinator() -> Coordinator { Coordinator(model: model) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "plannerNative")
        config.userContentController.addUserScript(WKUserScript(source: "window.plannerNativeScreenTime=true;document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.iphoneApp='true'});", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UITestFixture"), ["127.0.0.1", "localhost"].contains(AppConfiguration.origin.host ?? ""), let url = Bundle.main.url(forResource: "UITestFixture", withExtension: "js"), let script = try? String(contentsOf: url, encoding: .utf8) {
            if ProcessInfo.processInfo.arguments.contains("-UITestWidgets") { WidgetTaskControl.clear() }
            let fixture = (ProcessInfo.processInfo.arguments.contains("-UITestSignedIn") ? "globalThis.__plannerFixtureSignedIn=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestResumeSync") ? "globalThis.__plannerFixtureResumeSync=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestFocusZoom") ? "globalThis.__plannerFixtureFocusZoom=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestWidgets") ? "globalThis.__plannerFixtureWidgets=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestFreeTime") ? "globalThis.__plannerFixtureFreeTime=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestAtomicWidgetPlan") ? "globalThis.__plannerFixtureAtomicWidgetPlan=true;" : "") + script
            config.userContentController.addUserScript(WKUserScript(source: fixture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        let web = WKWebView(frame: .zero, configuration: config)
        web.accessibilityIdentifier = "plannerWebView"
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.keyboardDismissMode = .interactive
        web.isOpaque = false; web.backgroundColor = .systemBackground
        context.coordinator.webView = web
        context.coordinator.authentication = NativeAuthentication(webView: web)
        model.reload = { [weak web] in
            guard let web else { return }
            if web.url == nil { web.load(URLRequest(url: AppConfiguration.origin)) } else { web.reload() }
        }
        model.resume = { [weak web] in
            // Wait for WebKit to become visible, then reuse the frontend's
            // guarded refresh listeners. Do not reload or erase local drafts.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                web?.evaluateJavaScript("window.dispatchEvent(new Event('focus'));") { _, _ in }
            }
        }
        web.load(URLRequest(url: AppConfiguration.origin))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "plannerNative", contentWorld: .page)
        coordinator.hideScreenTime()
        web.stopLoading(); web.navigationDelegate = nil; web.uiDelegate = nil
    }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, WKDownloadDelegate {
        let model: PlannerModel
        weak var webView: WKWebView?
        var authentication: NativeAuthentication?
        var screenTimeHost: UIHostingController<ScreenTimeView>?
        func hideScreenTime() {
            if screenTimeHost?.presentedViewController != nil { screenTimeHost?.dismiss(animated: false) }
            screenTimeHost?.willMove(toParent: nil)
            screenTimeHost?.view.removeFromSuperview()
            screenTimeHost?.removeFromParent()
            screenTimeHost = nil
        }
        func showScreenTime(in rect: CGRect) {
            guard let web = webView, let parent = web.window?.rootViewController else { return }
            if screenTimeHost == nil {
                let host = UIHostingController(rootView: ScreenTimeView())
                host.view.backgroundColor = .systemGroupedBackground
                parent.addChild(host)
                web.addSubview(host.view)
                host.didMove(toParent: parent)
                screenTimeHost = host
            }
            screenTimeHost?.view.frame = rect
            if let view = screenTimeHost?.view { web.bringSubviewToFront(view) }
        }
        var downloads: [ObjectIdentifier: URL] = [:]
        init(model: PlannerModel) { self.model = model }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url, AppConfiguration.isPlanner(url),
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "Untrusted native bridge request."); return }
            Task { @MainActor in
                do {
                    switch action {
                    case "localReplicaAccount":
                        let account = body["account"] as? String
                        if account != WidgetTaskControl.defaults.string(forKey: "feedback-account") { WidgetTaskControl.clear() }
                        WidgetTaskControl.defaults.set(account, forKey: "feedback-account")
                        if account == nil { hideScreenTime() }
                        if try LocalReplicaStore.activate(account) {
                            WidgetTaskControl.clear()
                            try WidgetScheduleStore.save(.empty)
                            WidgetCenter.shared.reloadAllTimelines()
                        }
                    case "localReplica":
                        guard let account = body["account"] as? String, let kind = body["kind"] as? String,
                              let savedAt = body["savedAt"] as? Double, let payload = body["data"], JSONSerialization.isValidJSONObject(payload) else { throw NativeError("Missing local copy data.") }
                        try LocalReplicaStore.save(account: account, kind: kind, savedAt: savedAt, payload: payload)
                    case "screenTimePanel":
                        guard body["visible"] as? Bool == true else { hideScreenTime(); replyHandler(["ok": true], nil); return }
                        guard let bounds = body["rect"] as? [String: Double],
                              let x = bounds["x"], let y = bounds["y"], let width = bounds["width"], let height = bounds["height"],
                              [x, y, width, height].allSatisfy({ $0.isFinite }), width > 0, height > 0,
                              let web = self.webView else { throw NativeError("Screen Time layout is unavailable.") }
                        let rect = CGRect(x: x, y: y, width: width, height: height).intersection(web.bounds)
                        if rect.isNull || rect.isEmpty { hideScreenTime() } else { showScreenTime(in: rect) }
                    case "taskFeedback":
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account") else { replyHandler(NSNull(), nil); return }
                        if let data = WidgetTaskControl.defaults.data(forKey: "task-feedback") {
                            replyHandler(try JSONSerialization.jsonObject(with: data), nil)
                        } else { replyHandler(NSNull(), nil) }
                        return
                    case "taskFeedbackApplied":
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account") else { throw NativeError("Your account changed.") }
                        if let feedback = WidgetTaskControl.pending(), feedback.id == body["id"] as? String {
                            WidgetTaskControl.defaults.removeObject(forKey: WidgetTaskControl.key(feedback.task))
                            WidgetCenter.shared.reloadAllTimelines()
                        }
                    case "ackTaskFeedback":
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account") else { throw NativeError("Your account changed.") }
                        if let data = WidgetTaskControl.defaults.data(forKey: "task-feedback"),
                           let feedback = try? JSONDecoder().decode(WidgetTaskFeedback.self, from: data), feedback.id == body["id"] as? String {
                            if body["discard"] as? Bool == true { WidgetTimeOverrides.remove(feedback.id) }
                            WidgetTaskControl.defaults.removeObject(forKey: "task-feedback")
                            WidgetTaskControl.defaults.removeObject(forKey: WidgetTaskControl.key(feedback.task))
                            WidgetCenter.shared.reloadAllTimelines()
                        }
                    case "widgetStatus":
                        let schedule = WidgetScheduleStore.load()
                        replyHandler(["available": WidgetScheduleStore.file != nil, "generatedAt": schedule.generatedAt, "validUntil": schedule.validUntil, "eventCount": schedule.events.count, "currentTask": schedule.current(at: Date())?.title ?? ""], nil)
                        return
                    case "reloadWidgets": WidgetCenter.shared.reloadAllTimelines()
                    case "widgetSchedule":
                        guard let payload = body["schedule"], JSONSerialization.isValidJSONObject(payload) else { throw NativeError("Missing widget schedule.") }
                        let data = try JSONSerialization.data(withJSONObject: payload)
                        guard data.count <= 2 * 1024 * 1024 else { throw NativeError("Widget schedule is too large.") }
                        let schedule = try WidgetSchedule.decode(data)
                        if try WidgetScheduleStore.save(schedule) { WidgetCenter.shared.reloadAllTimelines() }
                    case "clearWidgetSchedule":
                        if try WidgetScheduleStore.save(.empty) { WidgetCenter.shared.reloadAllTimelines() }
                    case "googleSignIn": try await authentication?.signIn()
                    case "googleConnection":
                        guard let raw = body["url"] as? String, let url = URL(string: raw) else { throw NativeError("Missing connection URL.") }
                        try await authentication?.connectGoogle(url)
                    case "downloadText":
                        guard let text = body["text"] as? String, let name = body["name"] as? String, let data = text.data(using: .utf8), data.count <= 30 * 1024 * 1024 else { throw NativeError("File is missing or too large to share.") }
                        let url = try destination(name)
                        try data.write(to: url, options: [.atomic, .completeFileProtection])
                        model.sharedFile = SharedFile(url: url)
                    default: throw NativeError("Unsupported native action.")
                    }
                    replyHandler(["ok": true], nil)
                } catch is NativeAuthenticationCancelled { replyHandler(["cancelled": true], nil) }
                catch { replyHandler(nil, error.localizedDescription) }
            }
        }
        private func destination(_ name: String) throws -> URL {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Planner-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let safe = URL(fileURLWithPath: name).lastPathComponent
            return folder.appendingPathComponent(safe.isEmpty ? "Planner download" : safe)
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { model.loading = true; model.error = nil; hideScreenTime() }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { model.loading = false; WidgetCenter.shared.reloadAllTimelines() }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
        private func failed(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            model.loading = false; model.error = "Check your connection and try again. Your saved Planner data stays in your account."
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { model.loading = false; model.error = "Planner needs to reload. Your saved data is still available." }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if AppConfiguration.isPlanner(url) || url.scheme == "about" || url.scheme == "blob" {
                decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow); return
            }
            if ["https", "http"].contains(url.scheme ?? "") { model.browser = BrowserDestination(url: url) }
            else if ["mailto", "tel"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            let attachment = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true
            decisionHandler(!navigationResponse.canShowMIMEType || attachment ? .download : .allow)
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if AppConfiguration.isPlanner(url) || url.scheme == "blob" { webView.load(navigationAction.request) }
                else if url.scheme == "https" { model.browser = BrowserDestination(url: url) }
            }
            return nil
        }
        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            do { let url = try destination(suggestedFilename); downloads[ObjectIdentifier(download)] = url; completionHandler(url) }
            catch { completionHandler(nil); model.error = "Could not save the download." }
        }
        func downloadDidFinish(_ download: WKDownload) {
            if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { model.sharedFile = SharedFile(url: url) }
        }
        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloads.removeValue(forKey: ObjectIdentifier(download)); model.error = "Download interrupted. Please try again."
        }
        private func present(_ alert: UIAlertController) {
            var controller = webView?.window?.rootViewController
            while let next = controller?.presentedViewController { controller = next }
            controller?.present(alert, animated: true)
        }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let alert = UIAlertController(title: "AI Planner", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }); present(alert)
        }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let alert = UIAlertController(title: "AI Planner", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) }); present(alert)
        }
        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(origin.host == AppConfiguration.origin.host && frame.isMainFrame ? .prompt : .deny)
        }
    }
}
