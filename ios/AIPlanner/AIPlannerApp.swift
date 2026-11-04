import SwiftUI
import UserNotifications

@main
struct AIPlannerApp: App {
    @UIApplicationDelegateAdaptor(PlannerAppDelegate.self) private var appDelegate
    var body: some Scene {
        WindowGroup {
            #if DEBUG && targetEnvironment(simulator)
            if ProcessInfo.processInfo.arguments.contains("-UITestStandalonePicker") {
                StandaloneScreenTimePickerProbe()
            } else { PlannerScreen() }
            #else
            PlannerScreen()
            #endif
        }
    }
}

final class PlannerAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        FocusLocationController.shared.resume()
        UNUserNotificationCenter.current().delegate = self
        Task { await PlannerTaskNotifications.shared.refresh() }
        return true
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == WidgetFeedbackUpload.identifier else { completionHandler(); return }
        WidgetFeedbackUpload.shared.handleEvents(completion: completionHandler)
    }

}
