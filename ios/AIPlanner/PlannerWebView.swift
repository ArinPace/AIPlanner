import SwiftUI
import WebKit
import WidgetKit

struct PlannerWebView: UIViewRepresentable {
    @ObservedObject var model: PlannerModel
    func makeCoordinator() -> Coordinator { Coordinator(model: model) }
    func makeUIView(context: Context) -> WKWebView {
        let source = AppConfiguration.origin.absoluteString
        let previous = WidgetTaskControl.defaults.string(forKey: "widget-data-source")
        let legacyFixture = LocalReplicaStore.containsLegacyFixture || WidgetTimeOverrides.load().values.contains { $0.task.sourceEventId == "widget-test" || $0.task.id.hasPrefix("widget-test@") }
        if previous != nil && previous != source || legacyFixture {
            TaskFocusRules.clearAll()
            WidgetTaskControl.clear()
            WidgetTaskControl.defaults.removeObject(forKey: "feedback-account")
            if legacyFixture { _ = try? LocalReplicaStore.activate(nil) }
            _ = try? WidgetScheduleStore.save(.empty)
            WidgetCenter.shared.reloadAllTimelines()
        }
        WidgetTaskControl.defaults.set(source, forKey: "widget-data-source")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "plannerNative")
        config.userContentController.addUserScript(WKUserScript(source: "window.plannerNativeScreenTime=true;window.plannerNativeChatGPTPortal=true;document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.iphoneApp='true'});", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UITestFixture"), ["127.0.0.1", "localhost"].contains(AppConfiguration.origin.host ?? ""), let url = Bundle.main.url(forResource: "UITestFixture", withExtension: "js"), let script = try? String(contentsOf: url, encoding: .utf8) {
            if ProcessInfo.processInfo.arguments.contains("-UITestWidgets") { WidgetTaskControl.clear() }
            let fixture = (ProcessInfo.processInfo.arguments.contains("-UITestSignedIn") ? "globalThis.__plannerFixtureSignedIn=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestResumeSync") ? "globalThis.__plannerFixtureResumeSync=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestFocusZoom") ? "globalThis.__plannerFixtureFocusZoom=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestWidgets") ? "globalThis.__plannerFixtureWidgets=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestTaskFocusAll") ? "globalThis.__plannerFixtureTaskFocus=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestTaskFocusFuture") ? "globalThis.__plannerFixtureTaskFocusFuture=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestFreeTime") ? "globalThis.__plannerFixtureFreeTime=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestNextWidgetTask") ? "globalThis.__plannerFixtureNextWidgetTask=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestAtomicWidgetPlan") ? "globalThis.__plannerFixtureAtomicWidgetPlan=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestSourceAlerts") ? "globalThis.__plannerFixtureSourceAlerts=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestResetSourceAlerts") ? "globalThis.__plannerFixtureResetSourceAlerts=true;" : "") + (ProcessInfo.processInfo.arguments.contains("-UITestNotifications") ? "globalThis.__plannerFixtureNotifications=true;" : "") + script
            if ProcessInfo.processInfo.arguments.contains("-UITestBlankPageOnce") {
                config.userContentController.addUserScript(WKUserScript(source: "globalThis.__plannerFixtureBlankToken='" + UUID().uuidString + "';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
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
        model.reload = { [weak web, weak coordinator = context.coordinator] in
            guard let web else { return }
            coordinator?.lastRecovery = nil
            web.load(URLRequest(url: AppConfiguration.origin, cachePolicy: .reloadIgnoringLocalCacheData))
        }
        model.resume = { [weak web, weak coordinator = context.coordinator] in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                guard let web else { return }
                coordinator?.checkPage(web, notifyFocus: true)
            }
        }
        web.load(URLRequest(url: AppConfiguration.origin))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "plannerNative", contentWorld: .page)
        coordinator.hideScreenTime()
        coordinator.clearChatGPT()
        web.stopLoading(); web.navigationDelegate = nil; web.uiDelegate = nil
    }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, WKDownloadDelegate {
        let model: PlannerModel
        weak var webView: WKWebView?
        var authentication: NativeAuthentication?
        var chatGPTPortal: UINavigationController?
        func clearChatGPT() {
            (chatGPTPortal?.viewControllers.first as? PlannerChatGPTPortal)?.browser?.stopLoading()
            chatGPTPortal?.dismiss(animated: false)
            chatGPTPortal?.willMove(toParent: nil); chatGPTPortal?.view.removeFromSuperview(); chatGPTPortal?.removeFromParent()
            chatGPTPortal = nil; chatGPTAccount = nil
        }
        var openedChatGPTForTest = false
        var chatGPTAccount: String?
        func relay(account: String) throws -> PlannerChatGPTPortal {
            guard account == WidgetTaskControl.defaults.string(forKey: "feedback-account"), !account.isEmpty else { throw NativeError("Sign into Planner first.") }
            if chatGPTAccount != account || chatGPTPortal == nil {
                chatGPTPortal?.willMove(toParent: nil); chatGPTPortal?.view.removeFromSuperview(); chatGPTPortal?.removeFromParent()
                let controller = PlannerChatGPTPortal(account: account)
                let nav = UINavigationController(rootViewController: controller)
                nav.modalPresentationStyle = .fullScreen
                controller.onClose = { [weak self, weak nav] in nav?.dismiss(animated: true) { self?.parkRelay() } }
                chatGPTPortal = nav; chatGPTAccount = account
                parkRelay()
            }
            let controller = chatGPTPortal!.viewControllers[0] as! PlannerChatGPTPortal
            controller.loadViewIfNeeded()
            return controller
        }
        func attachRelayForRun() {
            guard let nav = chatGPTPortal, nav.parent == nil, nav.presentingViewController == nil, let web = webView, let parent = web.window?.rootViewController else { return }
            parent.addChild(nav); web.insertSubview(nav.view, at: 0); nav.didMove(toParent: parent)
            nav.view.frame = web.bounds; nav.view.alpha = 0.01; nav.view.isUserInteractionEnabled = false; nav.view.accessibilityElementsHidden = true
            nav.view.layoutIfNeeded()
        }
        func parkRelay() {
            guard let nav = chatGPTPortal, let web = webView, nav.presentingViewController == nil else { return }
            // Keep the relay retained but outside the visible view tree. A nested
            // WKWebView can steal keyboard focus and leak hidden accessibility nodes.
            if nav.parent != nil { nav.willMove(toParent: nil); nav.view.removeFromSuperview(); nav.removeFromParent() }
            nav.loadViewIfNeeded(); nav.view.frame = web.bounds
            nav.view.isUserInteractionEnabled = false; nav.view.accessibilityElementsHidden = true
            let controller = nav.viewControllers.first
            controller?.loadViewIfNeeded(); controller?.view.frame = nav.view.bounds
            controller?.view.layoutIfNeeded()
            (controller as? PlannerChatGPTPortal)?.browser?.endEditing(true)
        }
        var screenTimeHost: UIHostingController<ScreenTimeView>?
        weak var taskScreenTimeHost: UIViewController?
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
        var lastRecovery: Date?
        func checkPage(_ web: WKWebView, notifyFocus: Bool = false) {
            let script = "(() => { if (\(notifyFocus ? "true" : "false")) window.dispatchEvent(new Event('focus')); return location.pathname !== '/' || document.readyState === 'loading' || Boolean(document.getElementById('root')?.childElementCount); })()"
            web.evaluateJavaScript(script) { [weak self, weak web] value, error in
                guard let self, let web else { return }
                if error != nil || value as? Bool != true { self.recover(web) }
            }
        }
        func recover(_ web: WKWebView) {
            if let lastRecovery, Date().timeIntervalSince(lastRecovery) < 30 {
                model.loading = false
                model.error = "Planner couldn't finish loading. Try again to reload your saved plan."
                return
            }
            lastRecovery = Date(); model.error = nil; model.loading = true
            web.load(URLRequest(url: AppConfiguration.origin, cachePolicy: .reloadIgnoringLocalCacheData))
        }
        var downloads: [ObjectIdentifier: URL] = [:]
        init(model: PlannerModel) { self.model = model }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url, AppConfiguration.isPlanner(url),
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "Untrusted native bridge request."); return }
            Task { @MainActor in
                do {
                    switch action {
                    case "taskNotificationPermission":
                        replyHandler(try await PlannerTaskNotifications.shared.requestPermission(), nil); return
                    case "taskNotificationStatus":
                        replyHandler(await PlannerTaskNotifications.shared.status(), nil); return
                    case "taskNotificationSettings":
                        guard let account = body["account"] as? String, let value = body["settings"], JSONSerialization.isValidJSONObject(value) else { throw NativeError("Missing notification settings.") }
                        let options = try JSONDecoder().decode(TaskNotificationOptions.self, from: JSONSerialization.data(withJSONObject: value))
                        try await PlannerTaskNotifications.shared.configure(account: account, options: options)
                    case "chatGPTPortal", "chatGPTRelayStatus", "chatGPTRelaySend", "chatGPTRelayStop":
                        guard let account = body["account"] as? String else { throw NativeError("Sign into Planner first.") }
                        let controller = try relay(account: account)
                        if action == "chatGPTRelayStatus" { let state = try await controller.relayStatus(); if state["phase"] as? String == "completed" { parkRelay() }; replyHandler(state, nil); return }
                        if action == "chatGPTRelaySend" {
                            guard let text = body["text"] as? String, let chatId = body["chatId"] as? String, UUID(uuidString: chatId) != nil, !text.isEmpty, text.count <= 12000 else { throw NativeError("Choose a chat and enter a message.") }
                            attachRelayForRun()
                            do { try await controller.send(text: text, chatId: chatId) } catch { parkRelay(); throw error }
                            replyHandler(["ok": true], nil); return
                        }
                        if action == "chatGPTRelayStop" { try await controller.stopRelay(); parkRelay(); replyHandler(["ok": true], nil); return }
                        guard let parent = webView?.window?.rootViewController, parent.presentedViewController == nil, let portal = chatGPTPortal else { throw NativeError("Close the current menu first.") }
                        portal.willMove(toParent: nil); portal.view.removeFromSuperview(); portal.removeFromParent()
                        portal.view.alpha = 1; portal.view.isUserInteractionEnabled = true; portal.view.accessibilityElementsHidden = false
                        parent.present(portal, animated: true)
                    case "localReplicaAccount":
                        let account = body["account"] as? String
                        let changed = account != WidgetTaskControl.defaults.string(forKey: "feedback-account")
                        if changed { clearChatGPT(); TaskFocusRules.clearAll(); taskScreenTimeHost?.dismiss(animated: false); WidgetTaskControl.clear() }
                        WidgetTaskControl.defaults.set(account, forKey: "feedback-account")
                        #if DEBUG
                        if let account, !openedChatGPTForTest, ProcessInfo.processInfo.arguments.contains("-PlannerOpenChatGPT") {
                            openedChatGPTForTest = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                                guard let self, let parent = self.webView?.window?.rootViewController, parent.presentedViewController == nil, let _ = try? self.relay(account: account), let nav = self.chatGPTPortal else { return }
                                nav.willMove(toParent: nil); nav.view.removeFromSuperview(); nav.removeFromParent(); nav.view.alpha = 1; nav.view.isUserInteractionEnabled = true; nav.view.accessibilityElementsHidden = false; parent.present(nav, animated: true)
                            }
                        }
                        #endif
                        if account == nil { hideScreenTime() }
                        let replicaChanged = try LocalReplicaStore.activate(account)
                        if changed || replicaChanged {
                            WidgetTaskControl.clear()
                            try WidgetScheduleStore.save(.empty)
                            WidgetCenter.shared.reloadAllTimelines()
                            await PlannerTaskNotifications.shared.refresh()
                        }
                    case "localReplica":
                        guard let account = body["account"] as? String, let kind = body["kind"] as? String,
                              let savedAt = body["savedAt"] as? Double, let payload = body["data"], JSONSerialization.isValidJSONObject(payload) else { throw NativeError("Missing local copy data.") }
                        try LocalReplicaStore.save(account: account, kind: kind, savedAt: savedAt, payload: payload)
                    case "taskScreenTime":
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account"), let payload = body["task"], JSONSerialization.isValidJSONObject(payload), let parent = webView?.window?.rootViewController else { throw NativeError("Sign in to open task blocking.") }
                        let task = try JSONDecoder().decode(TaskFocusWindow.self, from: JSONSerialization.data(withJSONObject: payload))
                        guard task.valid else { throw NativeError("This task has invalid times. Refresh the calendar.") }
                        guard parent.presentedViewController == nil else { throw NativeError("Close the current menu before opening task blocking.") }
                        let host = UIHostingController(rootView: TaskScreenTimeView(account: account, task: task))
                        taskScreenTimeHost = host
                        parent.present(host, animated: true)
                    case "screenTimePanel":
                        guard body["visible"] as? Bool == true else { hideScreenTime(); replyHandler(["ok": true], nil); return }
                        guard let bounds = body["rect"] as? [String: Double],
                              let x = bounds["x"], let y = bounds["y"], let width = bounds["width"], let height = bounds["height"],
                              [x, y, width, height].allSatisfy({ $0.isFinite }), width > 0, height > 0,
                              let web = self.webView else { throw NativeError("Screen Time layout is unavailable.") }
                        let rect = CGRect(x: x, y: y, width: width, height: height).intersection(web.bounds)
                        if rect.isNull || rect.isEmpty { hideScreenTime() } else { showScreenTime(in: rect) }
                    case "widgetDeliverySession":
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account"), let token = body["token"] as? String, !token.isEmpty else { throw NativeError("Sign in before enabling widget delivery.") }
                        var deliveryOrigin = AppConfiguration.origin.absoluteString
                        #if DEBUG
                        if ProcessInfo.processInfo.arguments.contains("-UITestFixture"), let raw = ProcessInfo.processInfo.environment["AI_PLANNER_WIDGET_TEST_ORIGIN"], let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1" { deliveryOrigin = raw }
                        #endif
                        try WidgetBackgroundDelivery.configure(token: token, account: account, origin: deliveryOrigin)
                    case "taskFeedbackDelivery":
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account"), let id = body["id"] as? String else { throw NativeError("Your account changed.") }
                        replyHandler(WidgetTaskControl.defaults.string(forKey: "widget-delivery:" + id) as Any? ?? NSNull(), nil)
                        return
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
                        guard let account = body["account"] as? String, account == WidgetTaskControl.defaults.string(forKey: "feedback-account") else { throw NativeError("Widget account changed. Refresh your current plan.") }
                        guard let payload = body["schedule"], JSONSerialization.isValidJSONObject(payload) else { throw NativeError("Missing widget schedule.") }
                        let data = try JSONSerialization.data(withJSONObject: payload)
                        guard data.count <= 2 * 1024 * 1024 else { throw NativeError("Widget schedule is too large.") }
                        let schedule = try WidgetSchedule.decode(data)
                        TaskFocusRules.sync(windows: schedule.events.map { TaskFocusWindow(id: $0.id, sourceEventId: $0.sourceEventId ?? $0.id, title: $0.title, start: $0.start, end: $0.end) }, from: schedule.generatedAt, until: schedule.validUntil, account: account)
                        if try WidgetScheduleStore.save(schedule) { WidgetCenter.shared.reloadAllTimelines() }
                        await PlannerTaskNotifications.shared.refresh()
                    case "clearWidgetSchedule":
                        if try WidgetScheduleStore.save(.empty) { WidgetCenter.shared.reloadAllTimelines() }
                        await PlannerTaskNotifications.shared.refresh()
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
                catch { replyHandler(nil, (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription) }
            }
        }
        private func destination(_ name: String) throws -> URL {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Planner-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let safe = URL(fileURLWithPath: name).lastPathComponent
            return folder.appendingPathComponent(safe.isEmpty ? "Planner download" : safe)
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { model.loading = true; model.error = nil; hideScreenTime() }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.loading = false; WidgetCenter.shared.reloadAllTimelines()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self, weak webView] in
                guard let webView, !webView.isLoading else { return }
                self?.checkPage(webView)
            }
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
        private func failed(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            model.loading = false; model.error = "Check your connection and try again. Your saved Planner data stays in your account."
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { recover(webView) }
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


/// The real ChatGPT website, with its own persistent account-isolated WebKit store.
/// No Planner native bridge is injected here, and no credentials are read or exported.
@MainActor final class PlannerChatGPTPortal: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let account: String
    var onClose: (() -> Void)?
    var documentCommitted = false
    var webFailure: String?
    var recoveryCount = 0
    var loadedChat: String?
    var pendingURL: String?
    var pendingChat: String?
    var baseline = 0
    var sawRunning = false
    var lastText = ""
    var changedAt = Date()
    var startedAt = Date()
    var browser: WKWebView!
    let status = UILabel()
    init(account: String) { self.account = account; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "ChatGPT website"
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        let key = "chatgpt-web-store:" + account
        let identifier = UUID(uuidString: UserDefaults.standard.string(forKey: key) ?? "") ?? UUID()
        UserDefaults.standard.set(identifier.uuidString, forKey: key)
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: identifier)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UITestGuestRelay") { configuration.websiteDataStore = .nonPersistent() }
        #endif
        configuration.allowsInlineMediaPlayback = true
        browser = WKWebView(frame: .zero, configuration: configuration)
        browser.accessibilityIdentifier = "chatGPTPortalWebView"
        browser.navigationDelegate = self; browser.uiDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        browser.translatesAutoresizingMaskIntoConstraints = false
        status.accessibilityIdentifier = "chatgpt-load-status"
        status.font = .preferredFont(forTextStyle: .caption1); status.numberOfLines = 0
        status.text = "Sign in or approve access here, then return to Planner to chat. Planner tools are not connected yet."
        status.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(status); view.addSubview(browser)
        NSLayoutConstraint.activate([
            status.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
            status.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),status.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            browser.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 6),browser.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: view.trailingAnchor),browser.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Planner", style: .done, target: self, action: #selector(close))
        navigationItem.rightBarButtonItems = [UIBarButtonItem(title: "Safari", style: .plain, target: self, action: #selector(safari)),UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reload))]
        loadHome()
    }
    private func loadHome() {
        webFailure = nil
        status.text = "Loading ChatGPT… Sign in here, then tap Planner to return."
        browser.load(URLRequest(url: URL(string: "https://chatgpt.com/")!, timeoutInterval: 30))
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        browser.setNeedsLayout(); browser.layoutIfNeeded()
        // A cold offscreen WebKit load can remain provisional. Start it again
        // once visible, without reloading a committed sign-in page or active turn.
        if pendingChat == nil && !documentCommitted && (browser.url == nil || (browser.url?.host == "chatgpt.com" && browser.url?.path == "/")) {
            browser.stopLoading(); loadHome()
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .seconds(2))
            guard self.view.window != nil, self.pendingChat == nil, !self.browser.isLoading else { return }
            let blank = (try? await self.browser.evaluateJavaScript("!document.body || document.body.childElementCount === 0")) as? Bool ?? true
            if blank { self.loadHome() }

        }
    }
    private var snapshotScript: String { """
    (()=>{const visible=n=>!!n.getClientRects().length;
    const box=[...document.querySelectorAll('#prompt-textarea,[role="textbox"][contenteditable="true"],textarea')].find(visible);
    const buttons=[...document.querySelectorAll('button')].filter(visible);
    const label=n=>(n.getAttribute('aria-label')||n.innerText||'').trim();
    const running=buttons.some(n=>/^(Stop|Stop generating|Stop streaming|Pause|Pause task|Stop task)$/i.test(label(n))||n.dataset.testid==='stop-button');
    let raw=[...document.querySelectorAll('[data-message-author-role="assistant"],[data-markdown-text-style="assistant-message"]')];
    if(!raw.length)raw=[...document.querySelectorAll('button[aria-label="Copy response"]')].map(button=>button.closest('li')).filter(Boolean);
    const replies=raw.filter(n=>!raw.some(other=>other!==n&&other.contains(n)));
    const last=replies.at(-1),turn=last?.closest('[data-testid^="conversation-turn"],article')||last;
    const clean=last?.cloneNode(true);clean?.querySelectorAll('button,svg,script,style').forEach(node=>node.remove());
    const response=clean?(clean.innerText||clean.textContent||'').trim():'';
    return {ready:!!box,needsLogin:(!box&&buttons.some(n=>/^(Log in|Sign in)$/i.test(label(n))))||!!document.querySelector('input[type="password"]'),guest:buttons.some(n=>/^(Log in|Sign in)$/i.test(label(n))),running,count:replies.length,text:response,final:!!turn?.querySelector('[data-testid="copy-turn-action-button"],button[aria-label="Copy response"],button[aria-label="Copy"],button[aria-label="Good response"],button[aria-label="Read aloud"]'),url:location.href};})()
    """ }
    private func snapshot() async throws -> [String: Any] {
        loadViewIfNeeded()
        guard documentCommitted else { return ["ready": false, "needsLogin": false] }
        guard browser.url?.scheme == "https", browser.url?.host == "chatgpt.com" else { return ["ready": false,"needsLogin": true] }
        return try await browser.evaluateJavaScript(snapshotScript) as? [String: Any] ?? [:]
    }
    func send(text: String, chatId: String) async throws {
        guard pendingChat == nil else { throw NativeError("A ChatGPT reply is still pending. Open the session before retrying.") }
        let key = "chatgpt-conversation:" + account + ":" + chatId
        let stored = UserDefaults.standard.string(forKey: key).flatMap(URL.init(string:))
        let target = stored.flatMap { $0.scheme == "https" && $0.host == "chatgpt.com" && $0.path.hasPrefix("/c/") ? $0 : nil } ?? URL(string: "https://chatgpt.com/")!
        if stored != nil && browser.url?.absoluteString != target.absoluteString { browser.load(URLRequest(url: target, timeoutInterval: 30)) }
        else if let loadedChat, loadedChat != chatId {
            throw NativeError("This guest session already belongs to another Planner chat. Continue that chat, or sign in to use separate ChatGPT conversations.")
        }
        loadedChat = chatId
        var state: [String: Any] = [:]
        for _ in 0..<40 {
            try await Task.sleep(for: .milliseconds(500))
            state = try await snapshot()
            if state["ready"] as? Bool == true || state["needsLogin"] as? Bool == true { break }
        }
        guard state["ready"] as? Bool == true, state["needsLogin"] as? Bool != true else { throw NativeError("Sign into ChatGPT using Connect ChatGPT, then return to Planner.") }
        guard state["running"] as? Bool != true else { throw NativeError("ChatGPT is already working. Open the session to check it first.") }
        var clearTestDraft = false
        #if DEBUG
        clearTestDraft = ProcessInfo.processInfo.arguments.contains("-UITestClearRelayDraft")
        #endif
        let result = try await browser.callAsyncJavaScript("""
        const box=[...document.querySelectorAll('#prompt-textarea,[role="textbox"][contenteditable="true"],textarea')].find(n=>n.getClientRects().length);
        if(!box)throw Error('ChatGPT composer is unavailable.');
        if(clearTestDraft&&text==='Reply with exactly: Planner relay works.'&&(box.tagName==='TEXTAREA'?box.value:(box.innerText||'')).trim()===text){
          if(box.tagName==='TEXTAREA')Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,'');else box.textContent='';
          box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));await new Promise(resolve=>setTimeout(resolve,300));
        }
        if((box.tagName==='TEXTAREA'?box.value:(box.innerText||'')).trim())throw Error('ChatGPT has an unsent draft. Open the session and send or clear it first.');
        box.focus();
        if(box.tagName==='TEXTAREA'){const inserted=document.execCommand('insertText',false,text);if(!inserted)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,text);box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));box.dispatchEvent(new Event('change',{bubbles:true}));}
        else {document.execCommand('insertText',false,text);box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
        await new Promise(resolve=>setTimeout(resolve,500));
        if((box.tagName==='TEXTAREA'?box.value:(box.innerText||'')).trim()!==text.trim())throw Error('ChatGPT did not accept the complete draft. Check the session before retrying.');
        const send=box.closest('form')?.querySelector('button[type="submit"]:not(:disabled)')||[...document.querySelectorAll('button')].find(n=>!n.disabled&&n.getClientRects().length&&(n.dataset.testid==='send-button'||/^(Send|Send prompt|Send message|Submit)$/i.test(n.getAttribute('aria-label')||'')));
        if(!send)throw Error('ChatGPT Send button is unavailable. Draft retained in the session.');
        send.click();await new Promise(resolve=>setTimeout(resolve,500));
        const working=[...document.querySelectorAll('button')].some(n=>n.getClientRects().length&&/^(Stop|Stop generating|Stop streaming|Pause task|Stop task)$/i.test(n.getAttribute('aria-label')||n.innerText||''));
        if((box.tagName==='TEXTAREA'?box.value:(box.innerText||'')).trim()===text.trim()&&!working)throw Error('ChatGPT did not confirm submission. The draft remains in its session; inspect it before retrying.');
        return true;
        """, arguments: ["text": text, "clearTestDraft": clearTestDraft], in: nil, contentWorld: .page)
        guard result as? Bool == true else { throw NativeError("Message submission was not confirmed.") }
        pendingChat = chatId; pendingURL = target.path.hasPrefix("/c/") ? target.path : nil; baseline = state["count"] as? Int ?? 0; sawRunning = false; lastText = ""; changedAt = Date(); startedAt = Date()
    }
    func relayStatus() async throws -> [String: Any] {
        if let webFailure { return ["phase": "attention", "ready": false, "needsLogin": false, "message": webFailure] }
        var state = try await snapshot()
        #if DEBUG
        var diagnostic = state; diagnostic.removeValue(forKey: "text"); diagnostic.removeValue(forKey: "url")
        diagnostic["textLength"] = (state["text"] as? String)?.count ?? 0
        diagnostic["baseline"] = baseline; diagnostic["hasPending"] = pendingChat != nil; diagnostic["committed"] = documentCommitted; diagnostic["loading"] = browser.isLoading
        if let data = try? JSONSerialization.data(withJSONObject: diagnostic), let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first { try? data.write(to: folder.appendingPathComponent("ChatRelayDiagnostics.json"), options: .atomic) }
        #endif
        guard let chatId = pendingChat else { state["phase"] = "idle"; return state }
        state["phase"] = "working"
        if let url = state["url"] as? String, let parsed = URL(string: url), parsed.path.hasPrefix("/c/") {
            if let expected = pendingURL, expected != parsed.path { state["phase"] = "attention"; state["text"] = ""; state["message"] = "ChatGPT changed conversations. Open the session to check before retrying."; return state }
            pendingURL = parsed.path
        }
        if (state["count"] as? Int ?? 0) <= baseline { state["text"] = "" }
        if let url = state["url"] as? String, let parsed = URL(string: url), parsed.host == "chatgpt.com", parsed.path.hasPrefix("/c/") { UserDefaults.standard.set(url, forKey: "chatgpt-conversation:" + account + ":" + chatId) }
        sawRunning = sawRunning || state["running"] as? Bool == true
        let text = state["text"] as? String ?? ""
        if text != lastText { lastText = text; changedAt = Date() }
        if (state["count"] as? Int ?? 0) > baseline, !text.isEmpty, state["running"] as? Bool != true, (sawRunning || state["final"] as? Bool == true), Date().timeIntervalSince(changedAt) >= 3 {
            state["phase"] = "completed"; pendingChat = nil
        } else if Date().timeIntervalSince(startedAt) > 900 { state["phase"] = "attention"; state["message"] = "Reply completion could not be verified. Open ChatGPT before sending again." }
        return state
    }
    func stopRelay() async throws {
        guard browser.url?.host == "chatgpt.com" else { return }
        _ = try await browser.evaluateJavaScript("[...document.querySelectorAll('button')].find(n=>n.dataset.testid==='stop-button'||/^(Stop|Stop generating|Stop streaming|Stop task)$/i.test(n.getAttribute('aria-label')||''))?.click()")
        pendingChat = nil
    }
    @objc func close() { onClose?() }
    @objc func reload() {
        guard pendingChat == nil else { status.text = "A request may still be active. Return to Planner and stop it before reloading."; return }
        if browser.url == nil || webFailure != nil { loadHome() } else { browser.reload() }
    }
    @objc func safari() { UIApplication.shared.open(URL(string: "https://chatgpt.com/")!) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webFailure = nil; recoveryCount = 0
        status.text = "ChatGPT session · Sign in or approve access, then tap Planner. No credentials are copied to Planner."
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        documentCommitted = false; webFailure = nil
        status.text = "Loading ChatGPT…"
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { documentCommitted = true }
    private func failed(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        webFailure = "ChatGPT could not load: " + error.localizedDescription
        status.text = webFailure! + " Tap Reload to retry. Safari uses a separate sign-in session."
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if pendingChat == nil && recoveryCount < 1 { recoveryCount += 1; loadHome() }
        else { webFailure = "ChatGPT's web session stopped. Open the session to check its result before retrying."; status.text = webFailure }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Keep sign-in links and user-opened tabs visible in this portal.
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }
}
