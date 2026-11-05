import SwiftUI
import WebKit
import WidgetKit
import CryptoKit

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
        config.userContentController.addUserScript(WKUserScript(source: "window.plannerNativeScreenTime=true;window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=3;document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.iphoneApp='true'});", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UITestRelayFileMatrix"), let group=ProcessInfo.processInfo.environment["PLANNER_TEST_FILE_GROUP"], ["documents","media"].contains(group), let folder=FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask).first, let data=try? Data(contentsOf:folder.appendingPathComponent("RelayFileMatrix-"+group+".json")), let fixtures=String(data:data,encoding:.utf8) {
            let script="""
            const relayFixtures=\(fixtures);
            document.addEventListener('DOMContentLoaded',()=>{const button=document.createElement('button');button.textContent='Attach matrix test';button.style.cssText='position:fixed;top:160px;right:0;z-index:100000;background:white;color:black';button.onclick=()=>{const input=[...document.querySelectorAll('input[type=file]')].find(n=>n.accept==='*/*');if(!input)return;const transfer=new DataTransfer();for(const f of relayFixtures){const binary=atob(f.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));transfer.items.add(new File([bytes],f.name,{type:f.mime}))}input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));button.remove()};document.body.append(button)});
            """
            config.userContentController.addUserScript(WKUserScript(source:script,injectionTime:.atDocumentStart,forMainFrameOnly:true))
        }
        if ProcessInfo.processInfo.arguments.contains("-UITestRelayCSV") {
            config.userContentController.addUserScript(WKUserScript(source: """
            document.addEventListener('DOMContentLoaded',()=>{const button=document.createElement('button');button.textContent='Attach CSV test';button.style.cssText='position:fixed;top:160px;right:0;z-index:100000;background:white;color:black';button.onclick=()=>{const input=[...document.querySelectorAll('input[type=file]')].find(n=>n.accept==='*/*');if(!input)return;const transfer=new DataTransfer();transfer.items.add(new File([['kind,value','relay,INPUT-7319',''].join(String.fromCharCode(10))],'relay-check.csv',{type:'text/csv'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};document.body.append(button)});
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
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
            (controller as? PlannerChatGPTPortal)?.setInteractive(false)
        }
        var relayOperationActive = false
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
                    case "chatGPTPortal", "chatGPTRelayStatus", "chatGPTRelaySend", "chatGPTRelayStop", "chatGPTRelayDraft", "chatGPTRelayClearDraft", "chatGPTRelayDownload", "chatGPTRelayMirror":
                        guard let account = body["account"] as? String else { throw NativeError("Sign into Planner first.") }
                        let controller = try relay(account: account)
                        if action == "chatGPTRelayStatus" {
                            if !controller.documentCommitted && controller.pendingChat == nil && chatGPTPortal?.presentingViewController == nil { attachRelayForRun() }
                            var state = try await controller.relayStatus(); state["chatId"] = controller.loadedChat
                            if !relayOperationActive && ((state["ready"] as? Bool == true && controller.pendingChat == nil) || state["phase"] as? String == "completed" || state["phase"] as? String == "attention") { parkRelay() }
                            replyHandler(state, nil); return
                        }
                        if action == "chatGPTRelayMirror" {
                            guard !relayOperationActive, chatGPTPortal?.presentingViewController == nil else { throw NativeError("Return to Planner and wait for the current operation before syncing chats.") }
                            guard let url = body["url"] as? String else { throw NativeError("Choose a linked conversation.") }
                            relayOperationActive = true; attachRelayForRun(); defer { relayOperationActive = false; parkRelay() }
                            replyHandler(try await controller.mirrorConversation(url: url, patch: body["patch"] as? [String: Any] ?? [:], expected: body["expected"] as? [String: Any]), nil); return
                        }
                        if action == "chatGPTRelayDraft" { replyHandler(try await controller.inspectDraft(), nil); return }
                        if action == "chatGPTRelayClearDraft" {
                            guard let expected = body["expected"] as? String else { throw NativeError("Read the draft before clearing it.") }
                            relayOperationActive = true; attachRelayForRun(); defer { relayOperationActive = false; parkRelay() }
                            try await controller.clearDraft(expected: expected); replyHandler(["ok": true], nil); return
                        }
                        if action == "chatGPTRelayDownload" {
                            guard let key = body["key"] as? String, UUID(uuidString: key) != nil else { throw NativeError("Choose a response file.") }
                            relayOperationActive = true; attachRelayForRun(); defer { relayOperationActive = false; parkRelay() }
                            replyHandler(try await controller.downloadResponse(key: key), nil); return
                        }
                        if action == "chatGPTRelaySend" {
                            guard let text = body["text"] as? String, let chatId = body["chatId"] as? String, UUID(uuidString: chatId) != nil, !text.isEmpty, text.count <= 40000 else { throw NativeError("Choose a chat and enter a message.") }
                            relayOperationActive = true; defer { relayOperationActive = false }
                            attachRelayForRun()
                            do { try await controller.send(text: text, chatId: chatId, files: body["files"] as? [[String: Any]] ?? [], providerURL: body["url"] as? String, context: body["context"] as? String ?? "") } catch { parkRelay(); throw error }
                            replyHandler(["ok": true], nil); return
                        }
                        if action == "chatGPTRelayStop" { try await controller.stopRelay(); parkRelay(); replyHandler(["ok": true], nil); return }
                        guard let parent = webView?.window?.rootViewController, parent.presentedViewController == nil, let portal = chatGPTPortal else { throw NativeError("Close the current menu first.") }
                        portal.willMove(toParent: nil); portal.view.removeFromSuperview(); portal.removeFromParent()
                        portal.view.alpha = 1; portal.view.isUserInteractionEnabled = true; portal.view.accessibilityElementsHidden = false
                        controller.returnAfterAuthentication = body["intent"] as? String == "connect"
                        controller.setInteractive(true)
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
                                nav.willMove(toParent: nil); nav.view.removeFromSuperview(); nav.removeFromParent(); nav.view.alpha = 1; nav.view.isUserInteractionEnabled = true; nav.view.accessibilityElementsHidden = false; (nav.viewControllers.first as? PlannerChatGPTPortal)?.setInteractive(true); (nav.viewControllers.first as? PlannerChatGPTPortal)?.returnAfterAuthentication = ProcessInfo.processInfo.arguments.contains("-UITestReturnChatGPTOnReady"); parent.present(nav, animated: true)
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
                catch {
                    let detail = (error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("-UITestSignedRelayDiagnostics"), let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
                        var diagnostics: [String: Any] = ["error":detail]
                        if let portal = self.chatGPTPortal?.viewControllers.first as? PlannerChatGPTPortal, let value = try? await portal.browser.evaluateJavaScript("JSON.stringify({path:location.pathname,visibility:document.visibilityState,focus:document.hasFocus(),dialogs:[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(n=>n.innerText.slice(0,1500)),inputs:[...document.querySelectorAll('input:not([type=password])')].map(n=>({type:n.type,label:n.getAttribute('aria-label')})),menus:[...document.querySelectorAll('[role=menu],[role=menuitem]')].map(n=>({text:n.innerText,rect:n.getBoundingClientRect().toJSON(),opacity:getComputedStyle(n).opacity,visibility:getComputedStyle(n).visibility})),actions:[...document.querySelectorAll('button[aria-label=\"Chat actions\"]')].map(n=>n.outerHTML),buttons:[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({label:n.getAttribute('aria-label')||n.getAttribute('title')||n.innerText,disabled:n.disabled,testid:n.dataset.testid})),composer:document.querySelector('[contenteditable=true][role=textbox]')?.outerHTML})") as? String { diagnostics["page"] = value }
                        if let data = try? JSONSerialization.data(withJSONObject: diagnostics) { try? data.write(to: folder.appendingPathComponent("SignedRelayFailure.json"),options:.atomic) }
                    }
                    #endif
                    replyHandler(nil,detail)
                }
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
@MainActor final class PlannerChatGPTPortal: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let account: String
    var onClose: (() -> Void)?
    var pendingDownloads: [ObjectIdentifier: URL] = [:]
    var downloadMimes: [ObjectIdentifier: String] = [:]
    var downloadResult: [String: Any]?
    var downloadFailure: String?
    var documentCommitted = false
    var webFailure: String?
    var recoveryCount = 0
    var preparedFileFingerprint: String?
    var loadedChat: String?
    var pendingURL: String?
    var pendingChat: String?
    var submittedDraftFingerprint: String?
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
        configuration.userContentController.addUserScript(WKUserScript(source: Self.composerReader, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.addUserScript(WKUserScript(source: Self.deletionObserver, injectionTime: .atDocumentStart, forMainFrameOnly: true))
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
        documentCommitted = false; webFailure = nil
        status.text = "Loading ChatGPT… Sign in here, then tap Planner to return."
        #if DEBUG
        if let value=ProcessInfo.processInfo.environment["PLANNER_TEST_CHAT_URL"], let target=canonicalConversation(value) { browser.load(URLRequest(url:target,timeoutInterval:30));return }
        #endif
        browser.load(URLRequest(url: URL(string: "https://chatgpt.com/")!, timeoutInterval: 30))
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        watchAuthentication()
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
    #if DEBUG
    private var remoteMirrorTestStarted = false
    private func inspectPageForTest() {
        guard ProcessInfo.processInfo.arguments.contains("-UITestInspectChatGPT") else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            if ProcessInfo.processInfo.arguments.contains("-UITestRemoteMirror"), !self.remoteMirrorTestStarted {
                self.remoteMirrorTestStarted = true
                try? await Task.sleep(for: .seconds(5))
                do {
                    guard self.account == "arin", let value=ProcessInfo.processInfo.environment["PLANNER_TEST_CHAT_URL"], let target=self.canonicalConversation(value), let project=UserDefaults.standard.string(forKey:"chatgpt-project:arin:Test"), let projectURL=URL(string:project), target.path.hasPrefix(projectURL.deletingLastPathComponent().path), let raw=ProcessInfo.processInfo.environment["PLANNER_TEST_REMOTE_PATCH"], let data=raw.data(using:.utf8), let patch=try JSONSerialization.jsonObject(with:data) as? [String:Any] else { throw NativeError("Choose an authorized Test conversation and test patch.") }
                    let result = try await self.mirrorConversation(url:target.absoluteString,patch:patch,expected:nil)
                    self.status.text="Remote test applied: " + String(describing:result)
                } catch { self.status.text="Remote test error: " + error.localizedDescription }
            }
            if ProcessInfo.processInfo.arguments.contains("-UITestEnsureProject") {
                try? await Task.sleep(for: .seconds(3))
                do { let url = try await self.ensureRelayProject(); self.status.text = "Test project ready: " + (url?.absoluteString ?? "guest") }
                catch { self.status.text = "Test project error: " + error.localizedDescription }
            }
            if ProcessInfo.processInfo.arguments.contains("-UITestInspectMirror") {
                try? await Task.sleep(for: .seconds(5))
                do { let value = try await self.browser.callAsyncJavaScript(self.mirrorScript, arguments:["operation":"read","url":self.browser.url?.absoluteString ?? "","title":"","expected":NSNull()], in:nil, contentWorld:.page); self.status.text="Mirror read: " + String(describing:value) }
                catch { self.status.text="Mirror error: " + error.localizedDescription }
            }
            for _ in 0..<100 {
            try? await Task.sleep(for: .seconds(1))
            let script = #"""
            (()=>{const visible=n=>!!n.getClientRects().length;return JSON.stringify({path:location.pathname,title:document.title,downloadText:[...document.querySelectorAll('p,a,button,span')].filter(n=>/^Download verification/.test(n.textContent.trim())).slice(-5).map(n=>{const c=n.cloneNode(true);[c,...c.querySelectorAll('[href],[src]')].forEach(x=>{x.removeAttribute('href');x.removeAttribute('src')});return c.outerHTML.slice(0,5000)}),downloads:[...document.querySelectorAll('a[href]')].filter(n=>/download|verification|sandbox|mnt|estuary/i.test(n.innerText+' '+n.getAttribute('href'))).map(n=>({text:n.innerText,path:(()=>{try{return new URL(n.href,location.href).pathname}catch{return 'invalid'}})(),download:n.getAttribute('download'),html:n.cloneNode(false).outerHTML.replace(/href=\"[^\"]*\"/g,'')})),bodyInert:document.body.inert,inertNodes:[...document.querySelectorAll('[inert],[aria-hidden="true"]')].filter(n=>n.querySelector('button[aria-label="Chat actions"]')).map(n=>n.outerHTML.slice(0,500)),composerHTML:document.querySelector('#prompt-textarea,[role="textbox"][contenteditable="true"],textarea')?.outerHTML.slice(0,8000),buttons:[...document.querySelectorAll('button')].filter(visible).map(n=>({label:n.getAttribute('aria-label')||n.innerText||'',testid:n.getAttribute('data-testid'),title:n.getAttribute('title')})),inputs:[...document.querySelectorAll('input:not([type=password]),textarea')].filter(visible).map(n=>({placeholder:n.placeholder,label:n.getAttribute('aria-label'),type:n.type})),projects:[...document.querySelectorAll('a[href]')].filter(n=>/project|Test/i.test(n.href+' '+n.innerText)).map(n=>({label:n.innerText,url:n.href})),dialogs:[...document.querySelectorAll('[role=dialog]')].map(n=>n.innerText.slice(0,1500)),menus:[...document.querySelectorAll('[role=menu],[data-radix-popper-content-wrapper]')].map(n=>({text:n.innerText,html:n.outerHTML.slice(0,12000)})),actions:[...document.querySelectorAll('button[aria-label="Chat actions"]')].map(n=>({html:n.outerHTML,rect:n.getBoundingClientRect().toJSON(),hit:document.elementFromPoint(n.getBoundingClientRect().x+10,n.getBoundingClientRect().y+10)?.outerHTML.slice(0,1000)}))})})()
            """#
            if let text = try? await self.browser.evaluateJavaScript(script) as? String, let data = text.data(using: .utf8), let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first { try? data.write(to: folder.appendingPathComponent("ChatGPTPageInspection.json"), options: .atomic) }
            }
        }
    }
    #endif
    var returnAfterAuthentication = false
    private var authenticationWatch: Task<Void, Never>?
    private func watchAuthentication() {
        authenticationWatch?.cancel()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UITestInspectChatGPT") { return }
        #endif
        authenticationWatch = Task { @MainActor [weak self] in
            guard let self else { return }; var verified = 0
            while !Task.isCancelled, self.navigationController?.presentingViewController != nil {
                if let state = try? await self.snapshot() {
                    if state["guest"] as? Bool == true || state["needsLogin"] as? Bool == true || self.browser.url?.host != "chatgpt.com" { self.returnAfterAuthentication = true }
                    if self.returnAfterAuthentication && state["ready"] as? Bool == true && state["guest"] as? Bool == false && state["needsLogin"] as? Bool != true { verified += 1 } else { verified = 0 }
                    if verified >= 2 { self.returnAfterAuthentication = false; self.onClose?(); return }
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); authenticationWatch?.cancel(); authenticationWatch = nil }
    // BEGIN_CHAT_PROJECT_SCRIPT
    private static var projectScript: String { #"""
// Visible ChatGPT project controls only. No private API, auth token or cookies.
const visible=n=>n&&n.getClientRects().length&&!n.closest('[aria-hidden="true"]');
const label=n=>(n.getAttribute('aria-label')||n.innerText||'').trim();
const buttons=()=>[...document.querySelectorAll('button')].filter(visible);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,message)=>{for(let i=0;i<100;i++){const value=fn();if(value)return value;await pause(100)}throw Error(message)};
if(location.origin!=='https://chatgpt.com')throw Error('Return to the signed-in ChatGPT session.');
if(buttons().some(n=>/^(Log in|Sign in)$/i.test(label(n))))throw Error('Sign in to ChatGPT to use the Test project.');
if(!buttons().some(n=>label(n)==='Project actions for '+projectName||label(n)==='Add new project')){
 const show=buttons().find(n=>/^(Show|Open) sidebar$/i.test(label(n)));show?.click();await pause(500);
}
let created=false;
if(!buttons().some(n=>label(n)==='Project actions for '+projectName)){
 const add=buttons().find(n=>label(n)==='Add new project');if(!add)throw Error('ChatGPT project controls are unavailable. No chat was sent outside Test.');add.click();
 const input=await wait(()=>[...document.querySelectorAll('[role="dialog"] input[type="text"]')].find(visible),'Project name field was not found.');
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,projectName);
 input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:projectName}));input.dispatchEvent(new Event('change',{bubbles:true}));
 const create=await wait(()=>buttons().find(n=>/^Create project$/i.test(label(n))&&!n.disabled),'Project creation did not become available.');create.click();
 await wait(()=>buttons().some(n=>label(n)==='Project actions for '+projectName)||![...document.querySelectorAll('[role="dialog"] input[type="text"]')].some(visible),'ChatGPT did not confirm project creation.');
 created=true;await pause(600);
}
const projectButton=buttons().find(n=>label(n)==='Project actions for '+projectName);
if(projectButton){
 const row=projectButton.closest('li,[role="listitem"]')||projectButton.parentElement.parentElement;
 const named=[...row.querySelectorAll('a,button,[role="button"],span,div')].filter(n=>visible(n)&&(n.innerText||'').trim()===projectName).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
 const target=named[0];if(!target)throw Error('The Test project row could not be opened.');target.click();await pause(500);
}else{
 const newChat=buttons().find(n=>label(n)==='New chat in '+projectName);if(newChat)newChat.click();
}
await wait(()=>/^\/g\/[A-Za-z0-9_-]+\/project$/.test(location.pathname),'The Test project destination was not confirmed.');
const close=buttons().find(n=>/^Close sidebar$/i.test(label(n)));close?.click();
return {url:location.origin+location.pathname,name:projectName,created};
"""# }
    // END_CHAT_PROJECT_SCRIPT
    private func ensureRelayProject() async throws -> URL? {
        guard account == "arin" else { return nil }
        let current = try await snapshot()
        guard current["guest"] as? Bool != true else { return nil }
        let key = "chatgpt-project:" + account + ":Test"
        if let cached = UserDefaults.standard.string(forKey: key), let url = URL(string: cached), url.scheme == "https", url.host == "chatgpt.com", url.path.range(of: "^/g/[A-Za-z0-9_-]+/project$", options:.regularExpression) != nil { return url }
        let draft = try await inspectDraft()
        guard (draft["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeError("ChatGPT has an unsent draft. Review it before setting up the Test project.") }
        setInteractive(true); defer { setInteractive(false) }
        guard let result = try await browser.callAsyncJavaScript(Self.projectScript, arguments: ["projectName": "Test"], in: nil, contentWorld: .page) as? [String: Any], let value = result["url"] as? String, let url = URL(string: value), url.host == "chatgpt.com", url.path.range(of: "^/g/[A-Za-z0-9_-]+/project$", options:.regularExpression) != nil else { throw NativeError("The Test project could not be confirmed. No message was sent outside it.") }
        UserDefaults.standard.set(url.absoluteString, forKey: key)
        return url
    }
    // BEGIN_CHAT_COMPOSER_READER
    private static var composerReader: String { #"""
// WebKit innerText can include CSS-generated placeholder text. It is not a draft.
window.__plannerComposer=()=>{const visible=n=>n&&n.getClientRects().length;return [...document.querySelectorAll('#prompt-textarea,[data-composer-markdown][contenteditable="true"]')].find(visible)||[...document.querySelectorAll('[role="textbox"][contenteditable="true"],textarea')].find(visible)};
window.__plannerComposerText=box=>!box?'':box.tagName==='TEXTAREA'?box.value:(box.textContent||'').trim()?(box.innerText||box.textContent||''):'';
window.__plannerHumanDraft=false;
for(const type of ['input','keydown','pointerdown'])document.addEventListener(type,event=>{const box=window.__plannerComposer();if(event.isTrusted&&!window.__plannerRelayEditing&&box?.contains(event.target))window.__plannerHumanDraft=true},true);
"""# }
    // END_CHAT_COMPOSER_READER
    // BEGIN_CHAT_DELETION_OBSERVER
    private static var deletionObserver: String { #"""
// Record only an explicit per-conversation Delete confirmation in this browser.
// Sidebar absence, failed loads, bulk-delete controls, and logout are ignored.
window.__plannerMirrorDeleted={};
let pending=null;
const check=()=>{
 if(!pending)return;
 const statuses=[...document.querySelectorAll('[role="status"],[role="alert"]')].map(n=>n.innerText||'').join('\n');
 if(/failed|unable|error|try again/i.test(statuses)){pending=null;return}
 if(/chat deleted|conversation deleted/i.test(statuses)||(location.pathname!==pending.path&&!document.querySelector('[role="alertdialog"] button'))){
  window.__plannerMirrorDeleted[pending.path]={title:pending.title,deleted:true};pending=null;
 }
};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button'),dialog=button?.closest('[role="dialog"],[role="alertdialog"]');
 if(!button||!dialog||!/^Delete(?: chat)?$/i.test((button.getAttribute('aria-label')||button.innerText||'').trim())||!/delete/i.test(dialog.innerText)||!/^\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]+$/.test(location.pathname))return;
 pending={path:location.pathname,title:document.title.replace(/\s*[-|–]\s*ChatGPT$/i,'').trim().slice(0,120)};
 setTimeout(check,500);
},true);
document.addEventListener('DOMContentLoaded',()=>new MutationObserver(check).observe(document.documentElement,{childList:true,subtree:true}));
"""# }
    // END_CHAT_DELETION_OBSERVER
    // BEGIN_CHAT_MIRROR_SCRIPT
    private var mirrorScript: String { #"""
// Only public page controls; no fetch, tokens, cookies, or private endpoints.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const visible=n=>{if(!n||n.closest('[aria-hidden="true"],[inert]'))return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0};
const label=n=>(n.getAttribute('aria-label')||n.innerText||'').trim();
const same=()=>location.origin==='https://chatgpt.com'&&location.pathname.split('/c/')[1]===new URL(url).pathname.split('/c/')[1];
if(!same())throw Error('The ChatGPT conversation changed. Sync was stopped.');
if([...document.querySelectorAll('button')].filter(visible).some(n=>/^(Log in|Sign in)$/i.test(label(n))))throw Error('Sign in to ChatGPT to sync saved conversations. Guest chats have no sidebar.');
const find=async(fn,message)=>{for(let i=0;i<50;i++){const value=fn();if(value)return value;await pause(100)}throw Error(message)};
const menuItems=()=>[...document.querySelectorAll('[role="menuitem"]')].filter(visible);
const escape=()=>{for(const type of ['keydown','keyup'])document.activeElement?.dispatchEvent(new KeyboardEvent(type,{key:'Escape',code:'Escape',bubbles:true}))};
const openMenu=async()=>{
 if(document.querySelector('[role="alertdialog"], [role="dialog"][data-state="open"] input'))throw Error('Close the ChatGPT dialog before syncing.');
 let items=menuItems();if(items.length){escape();await pause(100)}
 const foreground=[...document.querySelectorAll('[role="dialog"]')].filter(visible).reverse().find(n=>n.querySelector('button[aria-label="Chat actions"],button[data-testid="conversation-options-button"]'));
 const scope=foreground||document;
 const buttons=[...scope.querySelectorAll('button[aria-label="Chat actions"],button[data-testid="conversation-options-button"]')].filter(visible);
 if(buttons.length!==1)throw Error('ChatGPT conversation controls were not recognized. Open the session to check this chat.');
 const button=buttons[0];button.focus();
 // A saved page may render before its menu handlers hydrate. Retry only a
 // verified closed trigger; never toggle an already open menu closed.
 for(let i=0;i<30;i++){
  if(menuItems().length)return menuItems();
  if(button.getAttribute('aria-expanded')!=='true'){
   if(button.hasAttribute('aria-haspopup')){button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,pointerId:1,isPrimary:true,pointerType:'mouse',ctrlKey:false}));await pause(150)}
   if(!menuItems().length&&button.getAttribute('aria-expanded')!=='true')button.click();
  }
  await pause(250);
 }
 throw Error('ChatGPT did not open this conversation menu.');
};
const titleText=()=>document.title.replace(/^🐴\s*/,'').replace(/^ChatGPT\s*[-|–]\s*/i,'').replace(/\s*[-|–]\s*ChatGPT$/i,'').trim();
const read=async()=>{
 if(!same())throw Error('The ChatGPT conversation changed. Sync was stopped.');
 const items=await openMenu(),has=value=>items.some(n=>new RegExp('^'+value+'(?: chat)?$','i').test(label(n)));
 const unarchive=has('Unarchive'),archive=has('Archive');
 const explicitArchived=[...document.querySelectorAll('main [role="alert"],main [role="status"],main button')].filter(visible).some(n=>/^(Unarchive|This (?:chat|conversation) is archived)/i.test(label(n)));
 const title=titleText();escape();
 if(!title||/^ChatGPT$/i.test(title)||(!unarchive&&!archive&&!explicitArchived))throw Error('ChatGPT did not expose verified chat metadata. Missing history is not treated as deletion.');
 return {title:title.slice(0,120),archived:unarchive||explicitArchived,deleted:false};
};
if(operation==='read')return await read();
const before=await read();
if(expected&&['title','archived','deleted'].some(k=>before[k]!==expected[k]))throw Error('This ChatGPT conversation changed while syncing. Refresh and retry.');
const wanted=operation==='rename'?'Rename':operation==='archive'?'Archive':operation==='unarchive'?'Unarchive':operation==='delete'?'Delete':null;
if(!wanted)throw Error('Unsupported conversation operation.');
const items=await openMenu(),item=items.find(n=>new RegExp('^'+wanted+'(?: chat)?$','i').test(label(n)));
if(!item)throw Error('ChatGPT does not expose '+wanted+' for this conversation.');
item.click();
if(operation==='rename'){
 const input=await find(()=>[...document.querySelectorAll('[role="dialog"] input[type="text"],[role="dialog"] input:not([type]),header input[type="text"],header input:not([type])')].find(visible),'ChatGPT rename control was not found.');
 const dialog=input.closest('[role="dialog"]');
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,title);
 input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:title}));input.dispatchEvent(new Event('change',{bubbles:true}));
 await pause(100);
 if(dialog){const save=[...dialog.querySelectorAll('button')].find(n=>/^(Save|Rename)$/i.test(label(n)));if(!save||save.disabled)throw Error('ChatGPT rename could not be submitted.');save.click()}
 else{for(const type of ['keydown','keyup'])input.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',bubbles:true}))}
 await find(()=>titleText()===title,'ChatGPT did not confirm the new title.');return {applied:true};
}
if(operation==='delete'){
 const dialog=await find(()=>[...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].find(n=>visible(n)&&/delete/i.test(n.innerText)&&[...n.querySelectorAll('button')].some(b=>/^Delete(?: chat)?$/i.test(label(b)))),'ChatGPT delete confirmation was not found.');
 const buttons=[...dialog.querySelectorAll('button')].filter(n=>/^Delete(?: chat)?$/i.test(label(n)));
 if(buttons.length!==1||!same())throw Error('The deletion target could not be verified.');
 buttons[0].click();
 await find(()=>!same()||[...document.querySelectorAll('[role="status"],[role="alert"]')].some(n=>/chat deleted|conversation deleted/i.test(n.innerText)),'ChatGPT did not confirm deletion.');
 return {applied:true,deleted:true};
}
await pause(500);return {applied:true};
"""# }
    // END_CHAT_MIRROR_SCRIPT
    private var snapshotScript: String { """
    (()=>{const visible=n=>!!n.getClientRects().length;
    const box=window.__plannerComposer();
    const buttons=[...document.querySelectorAll('button')].filter(visible);
    const label=n=>(n.getAttribute('aria-label')||n.innerText||'').trim();
    const running=buttons.some(n=>/^(Stop|Stop generating|Stop streaming|Pause|Pause task|Stop task)$/i.test(label(n))||n.dataset.testid==='stop-button');
    let raw=[...document.querySelectorAll('[data-message-author-role="assistant"],[data-markdown-text-style="assistant-message"]')];
    if(!raw.length)raw=[...document.querySelectorAll('button[aria-label="Copy response"]')].map(button=>button.closest('li')).filter(Boolean);
    const replies=raw.filter(n=>!raw.some(other=>other!==n&&other.contains(n)));
    const last=replies.at(-1);let turn=last?.closest('[data-testid^="conversation-turn"],article,li')||last;
    const completionSelector='[data-testid="copy-turn-action-button"],button[aria-label="Copy response"],button[aria-label="Copy message"],button[aria-label="Copy"],button[aria-label="Good response"],button[aria-label="Read aloud"]';
    for(let node=last,depth=0;node&&depth<6;node=node.parentElement,depth++){
      const other=[...node.querySelectorAll('[data-message-author-role="assistant"],[data-markdown-text-style="assistant-message"]')].some(n=>n!==last&&!n.contains(last)&&!last.contains(n));
      if(other)break;if(node.querySelector(completionSelector)){turn=node;break}
    }
    const clean=last?.cloneNode(true);clean?.querySelectorAll('button,svg,script,style').forEach(node=>node.remove());
    const response=clean?(clean.innerText||clean.textContent||'').trim():'';
    const outputs=turn?[...turn.querySelectorAll('a[download],a[href^="sandbox:"],a[href*="/backend-api/files/"],a[href*="/backend-api/estuary/content"],button[aria-label^="Download "],button[aria-label="Save image"],[data-file-reference="true"][role="button"][aria-label^="Download "]')].map(node=>{node.dataset.plannerDownloadId ||= crypto.randomUUID();return {key:node.dataset.plannerDownloadId,name:(node.getAttribute('download')||node.innerText||node.getAttribute('aria-label')||'Download file').trim().slice(0,240)}}):[];
    return {files:outputs,ready:!!box,needsLogin:(!box&&buttons.some(n=>/^(Log in|Sign in)$/i.test(label(n))))||!!document.querySelector('input[type="password"]'),guest:buttons.some(n=>/^(Log in|Sign in)$/i.test(label(n))),running,count:replies.length,text:response,final:!!turn?.querySelector(completionSelector),url:location.href};})()
    """ }
    private func snapshot() async throws -> [String: Any] {
        loadViewIfNeeded()
        guard documentCommitted else { return ["ready": false, "needsLogin": false] }
        guard browser.url?.scheme == "https", browser.url?.host == "chatgpt.com" else { return ["ready": false,"needsLogin": true] }
        return try await browser.evaluateJavaScript(snapshotScript) as? [String: Any] ?? [:]
    }
    func setInteractive(_ allowed: Bool) {
        if !allowed && navigationController?.presentingViewController != nil { return }
        browser?.evaluateJavaScript("if(document.body)document.body.inert=" + (allowed ? "false" : "true"), completionHandler: { _, _ in })
        if !allowed { browser?.endEditing(true) }
    }
    func inspectDraft() async throws -> [String: Any] {
        guard browser.url?.host == "chatgpt.com" else { throw NativeError("Load ChatGPT first.") }
        return try await browser.evaluateJavaScript("({text:window.__plannerComposerText(window.__plannerComposer()),manual:window.__plannerHumanDraft===true})") as? [String:Any] ?? [:]
    }
    private func requireCleanDraft(_ message: String) async throws {
        let draft=try await inspectDraft(),text=draft["text"] as? String ?? ""
        if text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty{return}
        let key="chatgpt-project:"+account+":Test"
        let fingerprint=SHA256.hash(data:Data(text.trimmingCharacters(in:.whitespacesAndNewlines).utf8)).map{String(format:"%02x",$0)}.joined()
        let confirmed=UserDefaults.standard.stringArray(forKey:"chatgpt-confirmed-project-drafts:"+account+":Test") ?? []
        guard account == "arin",draft["manual"] as? Bool != true,let value=UserDefaults.standard.string(forKey:key),let project=URL(string:value),(browser.url?.path == project.path || browser.url?.path == "/"),confirmed.contains(fingerprint) else {throw NativeError(message)}
        // ChatGPT may restore an already-submitted prompt on the project home.
        // Only verified completed prompts in this same Test project qualify.
        try await clearDraft(expected:text)
    }
    func clearDraft(expected: String) async throws {
        guard pendingChat == nil, browser.url?.host == "chatgpt.com" else { throw NativeError("Stop the pending request first.") }
        setInteractive(true); defer { setInteractive(false) }
        _ = try await browser.callAsyncJavaScript("""
        const box=window.__plannerComposer();
        const value=window.__plannerComposerText(box);
        if(!box||value!==expected)throw Error('The ChatGPT draft changed. Read it again before clearing.');
        box.focus();window.__plannerRelayEditing=true;try{if(box.tagName==='TEXTAREA'){box.select();document.execCommand('delete');if(box.value)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,'');}else{document.getSelection().selectAllChildren(box);document.execCommand('delete');}
        box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));}finally{window.__plannerRelayEditing=false}window.__plannerHumanDraft=false;await new Promise(r=>setTimeout(r,300));if(window.__plannerComposerText(box).trim())throw Error('Clearing the draft was not confirmed. Open the session to inspect it.');return true;
        """, arguments: ["expected": expected], in: nil, contentWorld: .page)
    }
    func downloadResponse(key: String) async throws -> [String: Any] {
        guard browser.url?.host == "chatgpt.com" else { throw NativeError("Load the ChatGPT conversation first.") }
        downloadResult = nil; downloadFailure = nil
        setInteractive(true); defer { setInteractive(false) }
        _ = try await browser.callAsyncJavaScript("const node=[...document.querySelectorAll('[data-planner-download-id]')].find(n=>n.dataset.plannerDownloadId===key);if(!node)throw Error('The response file is no longer available.');if(node.tagName==='A'&&!node.hasAttribute('download'))node.setAttribute('download','');node.click();return true;", arguments: ["key": key], in: nil, contentWorld: .page)
        for _ in 0..<120 {
            try await Task.sleep(for: .milliseconds(500))
            if let result = downloadResult {
                _ = try? await browser.evaluateJavaScript("[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')||n.innerText||'').trim()==='Close viewer')?.click()")
                return result
            }
            if let failure = downloadFailure { throw NativeError(failure) }
        }
        throw NativeError("ChatGPT did not finish this download. Open the session to inspect it.")
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) { decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow) }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let attachment = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true
        decisionHandler(attachment || !navigationResponse.canShowMIMEType ? .download : .allow)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            guard response.expectedContentLength <= 25 * 1024 * 1024 else { downloadFailure = "Response file exceeds 25 MB."; completionHandler(nil); return }
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let name = URL(fileURLWithPath: suggestedFilename).lastPathComponent
            let file = folder.appendingPathComponent(name.isEmpty ? "download" : name)
            pendingDownloads[ObjectIdentifier(download)] = file; downloadMimes[ObjectIdentifier(download)] = response.mimeType ?? "application/octet-stream"; completionHandler(file)
        } catch { downloadFailure = "Could not save the response file."; completionHandler(nil) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        documentCommitted = true; webFailure = nil
        guard let url = pendingDownloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 25 * 1024 * 1024 else { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()); throw NativeError("Response file exceeds 25 MB.") }
            let data = try Data(contentsOf: url)
            defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
            guard data.count <= 25 * 1024 * 1024 else { throw NativeError("Response file exceeds 25 MB.") }
            let mime = downloadMimes.removeValue(forKey: ObjectIdentifier(download)) ?? "application/octet-stream"
            downloadResult = ["name": url.lastPathComponent,"size": data.count,"mime": mime,"data": "data:" + mime + ";base64," + data.base64EncodedString()]
        } catch { downloadFailure = error.localizedDescription }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { if let url = pendingDownloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }; downloadMimes.removeValue(forKey: ObjectIdentifier(download)); downloadFailure = error.localizedDescription }
    private func traceRelay(_ stage: String) {
        #if DEBUG
        guard ProcessInfo.processInfo.arguments.contains("-UITestSignedRelayDiagnostics"), let folder=FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask).first else{return}
        let values:[String:Any] = ["stage":stage,"time":Date().timeIntervalSince1970]
        if let data=try? JSONSerialization.data(withJSONObject:values){try? data.write(to:folder.appendingPathComponent("RelaySendStage.json"),options:.atomic)}
        #endif
    }
    func send(text: String, chatId: String, files: [[String: Any]] = [], providerURL: String? = nil, context: String = "") async throws {
        guard pendingChat == nil else { throw NativeError("A ChatGPT reply is still pending. Open the session before retrying.") }
        let key = "chatgpt-conversation:" + account + ":" + chatId
        let stored = canonicalConversation(providerURL)
        // The server binding is authoritative across devices. Restoring a Planner
        // copy of a permanently deleted conversation must start a fresh remote chat.
        if stored == nil && UserDefaults.standard.string(forKey: key) != nil {
            UserDefaults.standard.removeObject(forKey: key)
            if loadedChat == chatId { loadedChat = nil; loadHome() }
        }
        let cold = loadedChat != chatId && stored == nil
        let text = cold && !context.isEmpty ? "Conversation context for this Planner chat (earlier files may need restoring):\n" + String(context.suffix(24000)) + "\n\nCurrent user message:\n" + text : text
        traceRelay("project-start"); let project = try await ensureRelayProject(); traceRelay("project-ready")
        let target = stored.flatMap { $0.scheme == "https" && $0.host == "chatgpt.com" && $0.path.contains("/c/") ? $0 : nil } ?? project ?? URL(string: "https://chatgpt.com/")!
        if stored == nil && project != nil && browser.url?.absoluteString != target.absoluteString { documentCommitted = false; browser.load(URLRequest(url: target, timeoutInterval: 30)) }
        else if stored != nil && browser.url?.absoluteString != target.absoluteString { documentCommitted = false; browser.load(URLRequest(url: target, timeoutInterval: 30)) }
        else if let loadedChat, loadedChat != chatId {
            let draft = try await inspectDraft()
            guard (draft["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeError("ChatGPT has an unsent draft. Review it in Planner before switching conversations.") }
            let previous = browser!
            previous.stopLoading(); previous.removeFromSuperview()
            browser = WKWebView(frame: .zero, configuration: previous.configuration)
            browser.accessibilityIdentifier = "chatGPTPortalWebView"; browser.navigationDelegate = self; browser.uiDelegate = self
            browser.translatesAutoresizingMaskIntoConstraints = false; browser.allowsBackForwardNavigationGestures = true
            view.addSubview(browser)
            NSLayoutConstraint.activate([browser.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 6),browser.leadingAnchor.constraint(equalTo: view.leadingAnchor),browser.trailingAnchor.constraint(equalTo: view.trailingAnchor),browser.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
            view.layoutIfNeeded(); documentCommitted = false; webFailure = nil
            documentCommitted = false; browser.load(URLRequest(url: target, timeoutInterval: 30))
        }
        loadedChat = chatId
        var state: [String: Any] = [:]
        for _ in 0..<40 {
            try await Task.sleep(for: .milliseconds(500))
            state = try await snapshot()
            let correctPage = stored != nil ? canonicalConversation(browser.url?.absoluteString)?.lastPathComponent == stored?.lastPathComponent : browser.url?.path == target.path
            if state["needsLogin"] as? Bool == true || (correctPage && !browser.isLoading && state["ready"] as? Bool == true) { break }
        }
        guard state["ready"] as? Bool == true, state["needsLogin"] as? Bool != true else { throw NativeError("Sign into ChatGPT using Connect ChatGPT, then return to Planner.") }
        guard state["running"] as? Bool != true else { throw NativeError("ChatGPT is already working. Open the session to check it first.") }
        setInteractive(true); defer { setInteractive(false) }
        if stored == nil && project != nil {
            traceRelay("fresh-chat-start")
            _ = try await browser.callAsyncJavaScript(#"""
            const visible=n=>n&&n.getClientRects().length;const label=n=>(n.getAttribute('aria-label')||n.innerText||'').trim();
            let buttons=()=>[...document.querySelectorAll('button')].filter(visible);
            const show=buttons().find(n=>/^(Show|Open) sidebar$/i.test(label(n)));show?.click();
            let create=null;for(let i=0;i<50;i++){create=buttons().find(n=>label(n)==='New chat in Test');if(create)break;await new Promise(r=>setTimeout(r,100))}
            if(!create)throw Error('New chat in Test is unavailable. No message was sent outside the project.');create.click();
            await new Promise(r=>setTimeout(r,600));const close=buttons().find(n=>label(n)==='Close sidebar');close?.click();return true;
            """#, arguments: [:], in: nil, contentWorld: .page)
            for _ in 0..<40 {
                try await Task.sleep(for: .milliseconds(500));state = try await snapshot()
                if state["ready"] as? Bool == true && !browser.isLoading { break }
            }
            guard state["ready"] as? Bool == true else { throw NativeError("A fresh Test conversation was not confirmed. No message was sent.") }
            guard browser.url?.path == target.path else { throw NativeError("The fresh Test project composer was not confirmed. No message was sent.") }
            traceRelay("fresh-chat-ready")
            try await requireCleanDraft("ChatGPT has an unsent draft in Test. Review it before creating a new conversation.");setInteractive(true)
        }
        guard files.count <= 4 else { throw NativeError("Attach up to four files.") }
        if !files.isEmpty {
            let draft = try await inspectDraft()
            guard (draft["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeError("ChatGPT has an unsent draft. Review it before adding files.") }
            var total = 0; var fingerprints: [String] = []
            for file in files {
                guard let name = file["name"] as? String, !name.isEmpty, name.count <= 240, let encoded = file["data"] as? String,
                      let part = encoded.split(separator: ",", maxSplits: 1).last, let data = Data(base64Encoded: String(part)), !data.isEmpty, data.count <= 25 * 1024 * 1024, file["size"] as? Int == data.count else { throw NativeError("File is invalid or exceeds 25 MB.") }
                total += data.count; fingerprints.append(name + ":" + SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
            }
            let fingerprint = chatId + ":" + fingerprints.joined(separator: "|")
            guard total <= 50 * 1024 * 1024 else { throw NativeError("Attach at most 50 MB per message.") }
            traceRelay("upload-start")
            _ = try await browser.callAsyncJavaScript("""
            let input=document.querySelector('input[type="file"][aria-label="Attach files"]')||[...document.querySelectorAll('input[type="file"]')].find(n=>n.multiple)||document.querySelector('input[type="file"]');
            if(!input){const add=[...document.querySelectorAll('button')].find(n=>/^(Add files and more|Attach files|Add photos & files)$/i.test(n.getAttribute('aria-label')||n.innerText||''));add?.click();await new Promise(r=>setTimeout(r,300));input=document.querySelector('input[type="file"]');}
            if(!input)throw Error('ChatGPT file upload is unavailable in this session. Sign in if the website requests it.');
            const sameName=(actual,name)=>{if(actual===name)return true;const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';if(!actual.startsWith(stem)||!actual.endsWith(ext))return false;const suffix=actual.slice(stem.length,ext?-ext.length:undefined).trim();return /^[(][0-9]+[)]$/.test(suffix)};
            const attached=file=>[...document.querySelectorAll('button')].some(n=>n.getClientRects().length&&sameName((n.getAttribute('aria-label')||'').replace(/^Remove /,''),file.name));
            const already=prepared&&files.every(attached);
            const transfer=new DataTransfer();
            for(const item of files){const binary=atob(item.data.slice(item.data.indexOf(',')+1)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);transfer.items.add(new File([bytes],item.name,{type:item.mime||'application/octet-stream'}));}
            if(!already){input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
            for(let attempt=0;attempt<120;attempt++){await new Promise(r=>setTimeout(r,500));const text=document.body.innerText;if(files.every(attached)&&![...document.querySelectorAll('[role=progressbar]')].some(n=>n.getClientRects().length)&&!/upload failed|unsupported file|file type is not supported/i.test(text))return true;}
            throw Error('ChatGPT did not confirm every file. No message was sent. Missing attachments: '+files.filter(file=>!attached(file)).map(file=>file.name).join(', ')+'. Inspect the session for upload errors.');
            """, arguments: ["files": files,"prepared": preparedFileFingerprint == fingerprint], in: nil, contentWorld: .page)
            traceRelay("upload-confirmed"); preparedFileFingerprint = fingerprint
        }
        var clearTestDraft = false
        #if DEBUG
        clearTestDraft = ProcessInfo.processInfo.arguments.contains("-UITestClearRelayDraft")
        #endif
        traceRelay("submit-start"); browser.becomeFirstResponder()
        let result = try await browser.callAsyncJavaScript("""
        const box=window.__plannerComposer();
        if(!box)throw Error('ChatGPT composer is unavailable.');
        if(clearTestDraft&&text==='Reply with exactly: Planner relay works.'&&window.__plannerComposerText(box).trim()===text){
          if(box.tagName==='TEXTAREA')Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,'');else box.textContent='';
          box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));await new Promise(resolve=>setTimeout(resolve,300));
        }
        if(window.__plannerComposerText(box).trim())throw Error('ChatGPT has an unsent draft. Open the session and send or clear it first.');
        box.focus();window.__plannerRelayEditing=true;try{
        if(box.tagName==='TEXTAREA'){const inserted=document.execCommand('insertText',false,text);if(!inserted)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,text);box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));box.dispatchEvent(new Event('change',{bubbles:true}));}
        else {document.execCommand('insertText',false,text);box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
        }finally{window.__plannerRelayEditing=false}
        await new Promise(resolve=>setTimeout(resolve,500));
        if(window.__plannerComposerText(box).trim()!==text.trim())throw Error('ChatGPT did not accept the complete draft. Check the session before retrying.');
        let send=null;
        for(let attempt=0;attempt<100;attempt++){
          send=box.closest('form')?.querySelector('button[type="submit"]:not(:disabled)')||[...document.querySelectorAll('button')].find(n=>!n.disabled&&n.getAttribute('aria-disabled')!=='true'&&n.getClientRects().length&&(['send-button','composer-submit-button'].includes(n.dataset.testid)||/^(Send|Send prompt|Send message|Submit)$/i.test(n.getAttribute('aria-label')||n.getAttribute('title')||n.innerText||'')));
          if(send)break;
          if(attempt===10)box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!send)throw Error('ChatGPT Send button is unavailable. Draft retained in the session.');
        send.click();await new Promise(resolve=>setTimeout(resolve,500));
        const working=[...document.querySelectorAll('button')].some(n=>n.getClientRects().length&&/^(Stop|Stop generating|Stop streaming|Pause task|Stop task)$/i.test(n.getAttribute('aria-label')||n.innerText||''));
        if(window.__plannerComposerText(box).trim()===text.trim()&&!working)throw Error('ChatGPT did not confirm submission. The draft remains in its session; inspect it before retrying.');
        return true;
        """, arguments: ["text": text, "clearTestDraft": clearTestDraft], in: nil, contentWorld: .page)
        guard result as? Bool == true else { throw NativeError("Message submission was not confirmed.") }
        preparedFileFingerprint = nil
        traceRelay("submit-confirmed"); submittedDraftFingerprint=SHA256.hash(data:Data(text.trimmingCharacters(in:.whitespacesAndNewlines).utf8)).map{String(format:"%02x",$0)}.joined()
        _ = try? await browser.evaluateJavaScript("window.__plannerHumanDraft=false")
        pendingChat = chatId; pendingURL = target.path.contains("/c/") ? target.path : nil; baseline = state["count"] as? Int ?? 0; sawRunning = false; lastText = ""; changedAt = Date(); startedAt = Date()
    }
    private func canonicalConversation(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value), url.scheme == "https", url.host == "chatgpt.com", url.user == nil,
              url.path.range(of: #"^/(?:g/[A-Za-z0-9_-]+/)?c/[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil,
              url.lastPathComponent != "new" else { return nil }
        return URL(string: "https://chatgpt.com" + url.path)
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
        if let parsed = canonicalConversation(state["url"] as? String) {
            if let expected = pendingURL, URL(fileURLWithPath: expected).lastPathComponent != parsed.lastPathComponent { state["phase"] = "attention"; state["text"] = ""; state["message"] = "ChatGPT changed conversations. Open the session to check before retrying."; return state }
            pendingURL = parsed.path
        }
        if (state["count"] as? Int ?? 0) <= baseline { state["text"] = "" }
        if let parsed = canonicalConversation(state["url"] as? String) { let canonical = "https://chatgpt.com" + parsed.path; state["url"] = canonical; UserDefaults.standard.set(canonical, forKey: "chatgpt-conversation:" + account + ":" + chatId) } else { state.removeValue(forKey: "url") }
        sawRunning = sawRunning || state["running"] as? Bool == true
        let text = state["text"] as? String ?? ""
        if text != lastText { lastText = text; changedAt = Date() }
        if (state["guest"] as? Bool == true || canonicalConversation(state["url"] as? String) != nil), (state["count"] as? Int ?? 0) > baseline, (!text.isEmpty || !(state["files"] as? [[String: Any]] ?? []).isEmpty), state["running"] as? Bool != true, (sawRunning || state["final"] as? Bool == true), Date().timeIntervalSince(changedAt) >= 3 {
            state["phase"] = "completed"; pendingChat = nil
            if account == "arin", let fingerprint=submittedDraftFingerprint, let value=UserDefaults.standard.string(forKey:"chatgpt-project:"+account+":Test"), let projectURL=URL(string:value), let current=canonicalConversation(state["url"] as? String), current.path.hasPrefix(projectURL.deletingLastPathComponent().path) {
                let key="chatgpt-confirmed-project-drafts:"+account+":Test"
                var values=UserDefaults.standard.stringArray(forKey:key) ?? [];values.removeAll{$0==fingerprint};values.append(fingerprint);UserDefaults.standard.set(Array(values.suffix(20)),forKey:key)
            }
            submittedDraftFingerprint=nil

        } else if Date().timeIntervalSince(startedAt) > 900 { state["phase"] = "attention"; state["message"] = "Reply completion could not be verified. Open ChatGPT before sending again." }
        return state
    }
    func mirrorConversation(url: String, patch: [String: Any], expected: [String: Any]?) async throws -> [String: Any] {
        guard pendingChat == nil, let target = URL(string: url), target.scheme == "https", target.host == "chatgpt.com", target.query == nil, target.fragment == nil, target.user == nil,
              target.path.range(of: #"^/(?:g/[A-Za-z0-9_-]+/)?c/[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else { throw NativeError("Choose an idle, linked ChatGPT conversation.") }
        let deletionKey = "chatgpt-deleted:" + account + ":" + target.path
        if let known = UserDefaults.standard.dictionary(forKey: deletionKey) {
            if patch["deleted"] as? Bool == false { throw NativeError("ChatGPT deletion is permanent. Restore the Planner copy as a separate chat instead.") }
            return known
        }
        let lastKey = "chatgpt-mirror-last:" + account + ":" + target.path
        if let event = try? await browser.callAsyncJavaScript("return window.__plannerMirrorDeleted?.[path] || null", arguments: ["path": target.path], in: nil, contentWorld: .page) as? [String: Any], event["deleted"] as? Bool == true, var previous = UserDefaults.standard.dictionary(forKey: lastKey) {
            previous["deleted"] = true
            if let title = event["title"] as? String, !title.isEmpty { previous["title"] = title }
            UserDefaults.standard.set(previous, forKey: deletionKey); return previous
        }
        try await requireCleanDraft("ChatGPT has an unsent draft. Review it before syncing conversations.")
        setInteractive(true); defer { setInteractive(false) }
        func loadConversation() async throws {
            if browser.url?.absoluteString != target.absoluteString { documentCommitted=false;browser.load(URLRequest(url: target, timeoutInterval: 30)) }
            for _ in 0..<60 {
                if documentCommitted && canonicalConversation(browser.url?.absoluteString)?.lastPathComponent == target.lastPathComponent && !browser.isLoading, let state=try? await snapshot(), (state["count"] as? Int ?? 0)>0 { return }
                try await Task.sleep(for: .milliseconds(500))
            }
            throw NativeError("The linked ChatGPT conversation did not load. No deletion was inferred.")
        }
        try await loadConversation()
        func operation(_ name: String, title: String? = nil, before: [String: Any]? = nil) async throws -> [String: Any] {
            var arguments: [String: Any] = ["operation": name, "url": url, "title": title ?? "", "expected": (before as Any?) ?? NSNull()]
            if before == nil { arguments["expected"] = NSNull() }
            return try await browser.callAsyncJavaScript(mirrorScript, arguments: arguments, in: nil, contentWorld: .page) as? [String: Any] ?? [:]
        }
        var state = try await operation("read")
        UserDefaults.standard.set(state, forKey: lastKey)
        if let expected, !NSDictionary(dictionary: state).isEqual(to: expected) { throw NativeError("ChatGPT changed while syncing. Refresh and retry.") }
        if let title = patch["title"] as? String, title != state["title"] as? String {
            guard !title.isEmpty, title.count <= 120 else { throw NativeError("Use a chat title up to 120 characters.") }
            _ = try await operation("rename", title: title, before: state)
            documentCommitted=false;browser.reload();try await loadConversation();state = try await operation("read")
            guard state["title"] as? String == title else {throw NativeError("ChatGPT did not preserve the new title after reloading. The change remains pending.")}
        }
        if patch["deleted"] as? Bool == true {
            _ = try await operation("delete", before: state); state["deleted"] = true
            UserDefaults.standard.set(state, forKey: deletionKey); loadedChat = nil; return state
        }
        if let archived = patch["archived"] as? Bool, archived != state["archived"] as? Bool {
            _ = try await operation(archived ? "archive" : "unarchive", before: state)
            documentCommitted=false;browser.reload();try await loadConversation(); state = try await operation("read")
            guard state["archived"] as? Bool == archived else { throw NativeError("ChatGPT did not confirm archive status.") }
        }
        UserDefaults.standard.set(state, forKey: lastKey)
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
        #if DEBUG
        inspectPageForTest()
        #endif
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
