import SwiftUI

@main
struct AIPlannerApp: App {
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
