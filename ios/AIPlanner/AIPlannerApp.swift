import SwiftUI

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

final class PlannerAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        FocusLocationController.shared.resume()
        return true
    }
}
