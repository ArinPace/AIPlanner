import XCTest

final class PlannerUITests: XCTestCase {
    private func launch(signedIn: Bool = true, resumeSync: Bool = false, focusZoom: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture"] + (signedIn ? ["-UITestSignedIn"] : []) + (resumeSync ? ["-UITestResumeSync"] : []) + (focusZoom ? ["-UITestFocusZoom"] : [])
        app.launch(); return app
    }
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testScreenTimeRealSystemPicker() {
        let app = launch()
        app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        let allow = app.buttons["Allow Screen Time access"]
        if allow.waitForExistence(timeout: 2) {
            allow.tap()
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            let permission = XCUIApplication(bundleIdentifier: "com.apple.FamilyControlsAuthenticationUI")
            print("SCREEN_TIME_PERMISSION_UI", permission.debugDescription)
            for _ in 0..<3 {
                if app.buttons["Continue"].waitForExistence(timeout: 2) { app.buttons["Continue"].tap() }
                else if springboard.buttons["Continue"].exists { springboard.buttons["Continue"].tap() }
                else if springboard.buttons["Allow"].exists { springboard.buttons["Allow"].tap() }
                else if springboard.buttons["Allow with Face ID"].exists { springboard.buttons["Allow with Face ID"].tap() }
                else if springboard.buttons["Allow with Passcode"].exists { springboard.buttons["Allow with Passcode"].tap() }
                else if permission.buttons["Continue"].exists { permission.buttons["Continue"].tap() }
                else if permission.buttons["Allow"].exists { permission.buttons["Allow"].tap() }
            }
        }
        print("SCREEN_TIME_AUTHENTICATION_RESULT", XCUIApplication(bundleIdentifier: "com.apple.springboard").debugDescription)
        let choose = app.buttons["Choose apps"]
        XCTAssertTrue(choose.isEnabled, "System Screen Time authorization must succeed")
        choose.tap()
        let done = app.buttons["Done"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 10))
        done.tap()
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Screen Time system picker"; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testStandaloneScreenTimePickerDiagnostics() {
        let app = XCUIApplication()
        app.launchArguments = ["-UITestStandalonePicker"]
        app.launch()
        for pass in 1...2 {
            app.buttons["Choose apps"].tap()
            let done = app.buttons["Done"].firstMatch
            XCTAssertTrue(done.waitForExistence(timeout: 15))
            let other = app.staticTexts["Other"].firstMatch
            for _ in 0..<4 {
                if other.exists && other.isHittable { break }
                app.swipeUp()
            }
            XCTAssertTrue(other.exists)
            other.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 255, dy: 8)).tap()
            app.swipeUp()
            print("STANDALONE_PICKER_INVENTORY_PASS", pass, app.debugDescription)
            let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            screenshot.name = "Standalone picker inventory pass \(pass)"; screenshot.lifetime = .keepAlways; add(screenshot)
            done.tap()
        }
    }
    func testScreenTimeSessionPersistenceAndEarlyStop() {
        let app = launch()
        app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        let start = app.buttons["Start blocking"]
        XCTAssertTrue(start.waitForExistence(timeout: 10)); XCTAssertTrue(start.isEnabled)
        app.buttons["Decrement"].tap()
        start.tap()
        let stop = app.buttons["End blocking"]
        XCTAssertTrue(stop.waitForExistence(timeout: 10), app.debugDescription)
        defer { app.activate(); app.webViews.buttons["Screen Time"].tap(); if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() } }
        app.terminate(); app.launch(); app.webViews.buttons["Screen Time"].tap()
        XCTAssertTrue(app.buttons["End blocking"].waitForExistence(timeout: 10))
        app.buttons["End blocking"].tap()
        XCTAssertTrue(app.buttons["Start blocking"].waitForExistence(timeout: 5))
    }
    func testScreenTimeBackgroundExpiry() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_BACKGROUND_EXPIRY"] == "1", "This real DeviceActivity integration test takes 15 minutes; enable PLANNER_VERIFY_BACKGROUND_EXPIRY on the test runner.")
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn", "-UITestFocusExpiry"]
        app.launch()
        app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        app.buttons["Decrement"].tap()
        let began = Date().timeIntervalSince1970
        app.buttons["Start blocking"].tap()
        XCTAssertTrue(app.buttons["End blocking"].waitForExistence(timeout: 10))
        app.terminate()
        let elapsed = expectation(description: "Real 15-minute DeviceActivity interval")
        DispatchQueue.main.asyncAfter(deadline: .now() + 905) { elapsed.fulfill() }
        wait(for: [elapsed], timeout: 920)
        XCUIDevice.shared.press(.home)
        let callbackGrace = expectation(description: "System extension callback")
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { callbackGrace.fulfill() }
        wait(for: [callbackGrace], timeout: 10)
        app.launch(); app.webViews.buttons["Screen Time"].tap()
        XCTAssertTrue(app.buttons["Start blocking"].waitForExistence(timeout: 5))
        let marker = app.staticTexts["focusMonitorExpiry"]
        XCTAssertTrue(marker.exists)
        let callback = NSPredicate { _, _ in (Double(marker.label) ?? 0) > began }
        expectation(for: callback, evaluatedWith: marker)
        waitForExpectations(timeout: 10)
    }
    func testScreenTimeEmptySelectionValidation() throws {
        let app = launch()
        app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        app.buttons["Choose apps"].tap()
        let all = app.descendants(matching: .any).matching(identifier: "All Apps & Categories").firstMatch
        XCTAssertTrue(all.waitForExistence(timeout: 10))
        try XCTSkipUnless(all.isSelected || (all.value as? String) == "1", "Run this validation with all categories selected so the original selection can be restored exactly.")
        all.tap(); app.buttons["Done"].tap()
        app.buttons["Start blocking"].tap()
        XCTAssertTrue(app.staticTexts["Choose apps to block first."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["End blocking"].exists)
        app.buttons["Choose apps"].tap()
        XCTAssertTrue(all.waitForExistence(timeout: 10)); all.tap(); app.buttons["Done"].tap()
        XCTAssertFalse(app.staticTexts["Choose apps to block first."].exists)
    }
    private func verifyScreenTimeHomeScreen(policy: String, category: String? = nil) {
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn", "-UITestPolicyRecovery", policy]
        app.launch(); app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        app.buttons["Choose apps"].tap()
        let all = app.descendants(matching: .any).matching(identifier: "All Apps & Categories").firstMatch
        XCTAssertTrue(all.waitForExistence(timeout: 10))
        let selectedAll = all.isSelected || (all.value as? String) == "1"
        if let category {
            if !selectedAll { all.tap() }
            all.tap()
            let predicate = NSPredicate(format: "label BEGINSWITH %@", category)
            let toggle = app.switches.matching(predicate).firstMatch.exists ? app.switches.matching(predicate).firstMatch : app.buttons.matching(predicate).firstMatch
            XCTAssertTrue(toggle.exists); toggle.tap()
        } else {
            if selectedAll { all.tap() }
            all.tap()
        }
        app.buttons["Done"].tap()
        app.buttons["Start blocking"].tap()
        XCTAssertTrue(app.buttons["End blocking"].waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        // A Calendar widget has the same identifier; select only the app icon.
        let icon = springboard.icons.matching(identifier: "Calendar").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
        XCTAssertTrue(icon.waitForExistence(timeout: 5))
        if category != nil {
            let maps = springboard.icons.matching(identifier: "Maps").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
            XCTAssertFalse((maps.value as? String)?.contains("Timed out") ?? false, "An unselected app must remain available.")
        }
        let timedOut = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value CONTAINS[c] 'Timed out'"), object: icon)
        let blocked = XCTWaiter.wait(for: [timedOut], timeout: 5) == .completed
        icon.tap()
        let calendar = XCUIApplication(bundleIdentifier: "com.apple.mobilecal")
        _ = calendar.wait(for: .runningForeground, timeout: 2)
        let restricted = calendar.staticTexts["Restricted"].waitForExistence(timeout: 3) || springboard.staticTexts["Restricted"].exists
        print("HOME_SCREEN_SHIELD", policy, "iconTimedOut", blocked, "restrictedScreen", restricted)
        print("HOME_SCREEN_BLOCKED_APP", calendar.debugDescription)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = "Home Screen OS enforcement \(policy)"; shot.lifetime = .keepAlways; add(shot)
        let cleared = expectation(description: "Diagnostic auto-clear")
        DispatchQueue.main.asyncAfter(deadline: .now() + 32) { cleared.fulfill() }
        wait(for: [cleared], timeout: 40)
        app.activate(); app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        icon.tap()
        let openedAfterClear = calendar.wait(for: .runningForeground, timeout: 5)
        XCTAssertTrue(blocked, "Selected app must be marked restricted by iOS.")
        XCTAssertTrue(restricted, "The system Restricted screen must replace the selected app's content.")
        XCTAssertFalse(calendar.staticTexts["Restricted"].exists, "The restriction must clear afterward.")
        XCTAssertTrue(openedAfterClear, "The same app must open after the block clears.")
    }
    func testScreenTimeAllAppsPolicyDiagnostic() { verifyScreenTimeHomeScreen(policy: "-UITestShieldAll") }
    func testScreenTimeHomeScreenEnforcement() { verifyScreenTimeHomeScreen(policy: "-UITestNormalPolicy") }
    func testScreenTimeSelectedCategoryEnforcement() { verifyScreenTimeHomeScreen(policy: "-UITestNormalPolicy", category: "Productivity & Finance") }
    func testConfigureSimulatorScreenTimeActivity() {
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        let row = settings.staticTexts["Screen Time"]
        for _ in 0..<4 { if row.exists && row.isHittable { break }; settings.swipeUp() }
        XCTAssertTrue(row.exists); row.tap()
        let activity = settings.staticTexts["APP_AND_WEBSITE_ACTIVITY"]
        if activity.waitForExistence(timeout: 3) { activity.tap() }
        let turnOn = settings.buttons["Turn On App & Website Activity"]
        if turnOn.waitForExistence(timeout: 3) { turnOn.tap() }
        if turnOn.waitForExistence(timeout: 2) { turnOn.tap() }
        print("SIMULATOR_SCREEN_TIME_SETTINGS", settings.debugDescription)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = "Screen Time activity settings"; shot.lifetime = .keepAlways; add(shot)
    }
    func testScreenTimeRequiresLoginAndKeepsPlannerNavigation() {
        let app = launch(signedIn: false)
        XCTAssertTrue(app.buttons["Continue with Google"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["Screen Time"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        app.textFields["Username or email"].tap(); app.textFields["Username or email"].typeText("arin")
        app.secureTextFields["Password"].tap(); app.secureTextFields["Password"].typeText("fixture-password")
        app.webViews.buttons.matching(identifier: "Sign in").allElementsBoundByIndex.first(where: { !$0.isSelected })!.tap()
        let screenTime = app.webViews.buttons["Screen Time"]
        XCTAssertTrue(screenTime.waitForExistence(timeout: 15))
        XCTAssertGreaterThan(screenTime.frame.minX, app.webViews.buttons["Agent"].frame.minX)
        screenTime.tap()
        XCTAssertTrue(app.buttons["Choose apps"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.buttons["Agent"].isHittable)
        app.webViews.buttons["Calendar"].tap()
        XCTAssertFalse(app.buttons["Choose apps"].exists)
        screenTime.tap()
        XCTAssertTrue(app.buttons["Choose apps"].waitForExistence(timeout: 5))
        app.webViews.buttons["Log out"].tap()
        XCTAssertTrue(app.buttons["Continue with Google"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Screen Time"].exists)
        XCTAssertFalse(app.buttons["Choose apps"].exists)
    }
    func testLoginAndExistingAccount() {
        let app = launch(signedIn: false)
        XCTAssertTrue(app.buttons["Continue with Google"].waitForExistence(timeout: 40))
        XCTAssertFalse(app.buttons["Screen Time"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        let identifier = app.textFields["Username or email"]
        XCTAssertTrue(identifier.exists); identifier.tap(); identifier.typeText("arin")
        let password = app.secureTextFields["Password"]; password.tap(); password.typeText("fixture-password")
        app.webViews.buttons.matching(identifier: "Sign in").allElementsBoundByIndex.first(where: { !$0.isSelected })!.tap()
        XCTAssertTrue(app.buttons["Calendar"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["Chat"].exists)
    }
    func testAllPlannerTabsWithoutExtensionChat() {
        let app = launch()
        XCTAssertTrue(app.buttons["Calendar"].waitForExistence(timeout: 40))
        XCTAssertFalse(app.buttons["Chat"].exists)
        app.buttons["To-do"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format:"label CONTAINS %@", "Prepare for statistics quiz")).firstMatch.waitForExistence(timeout: 15))
        app.buttons["Work"].tap()
        if app.alerts.firstMatch.waitForExistence(timeout: 1) { app.alerts.buttons["Continue"].tap() }
        let homework = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", "Homework due Friday", "Homework due Friday")).firstMatch
        if !homework.waitForExistence(timeout: 10) { print(app.debugDescription) }
        XCTAssertTrue(homework.exists)
        app.buttons["Files"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "iPhone test note")).firstMatch.waitForExistence(timeout: 15))
        app.buttons["Agent"].tap()
        XCTAssertTrue(app.staticTexts["Main Chat"].firstMatch.waitForExistence(timeout: 20))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "iPhone Agent"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testCalendarEditingAndNativeExport() {
        let app = launch()
        XCTAssertTrue(app.buttons["Calendar"].waitForExistence(timeout: 40))
        app.buttons["Create"].firstMatch.tap()
        let title = app.textFields["Add title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText("iPhone calendar test")
        app.buttons["Save"].firstMatch.tap()
        app.buttons["Month"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format:"label CONTAINS %@", "iPhone calendar test")).firstMatch.waitForExistence(timeout: 10))
        app.buttons["Settings"].firstMatch.tap()
        app.buttons["Download calendar JSON"].tap()
        XCTAssertTrue(app.buttons["Copy"].waitForExistence(timeout: 10) || app.buttons["Save to Files"].exists || app.otherElements["ActivityListView"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "iPhone native JSON share"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testRefreshesSharedCalendarOnReturningToApp() {
        let app = launch(resumeSync: true)
        XCTAssertTrue(app.buttons["Calendar"].waitForExistence(timeout: 40))
        XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Phone resume sync check")).firstMatch.exists)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(XCUIApplication(bundleIdentifier: "com.apple.springboard").wait(for: .runningForeground, timeout: 5))
        app.activate()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Phone resume sync check")).firstMatch.waitForExistence(timeout: 5))
    }

    func testCancelGoogleSignInKeepsLoginLayout() {
        let app = launch(signedIn: false)
        let google = app.buttons["Continue with Google"]
        XCTAssertTrue(google.waitForExistence(timeout: 40))
        let identifier = app.textFields["Username or email"]
        let before = identifier.frame
        google.tap()
        let appCancel = app.buttons["Cancel"].firstMatch
        let systemCancel = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Cancel"].firstMatch
        let browserCancel = XCUIApplication(bundleIdentifier: "com.apple.SafariViewService").buttons["Cancel"].firstMatch
        if appCancel.waitForExistence(timeout: 5) { appCancel.tap() }
        else if systemCancel.exists { systemCancel.tap() }
        else { XCTAssertTrue(browserCancel.waitForExistence(timeout: 5)); browserCancel.tap() }
        XCTAssertTrue(google.waitForExistence(timeout: 5))
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: google); waitForExpectations(timeout: 5)
        XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "AuthenticationServices")).firstMatch.exists)
        XCTAssertEqual(before.width, identifier.frame.width, accuracy: 1)
        XCTAssertLessThanOrEqual(identifier.frame.maxX, app.windows.firstMatch.frame.maxX)
    }

    func testEditableFieldsKeepViewportScaleAfterFocusAndDismissal() {
        let app = launch(focusZoom: true)
        XCTAssertTrue(app.buttons["Calendar"].waitForExistence(timeout: 40))
        let scale = app.staticTexts["Viewport scale 1.00"]
        XCTAssertTrue(scale.waitForExistence(timeout: 5))
        app.buttons["Agent"].tap()
        let message = app.textViews["Message your assistant"]
        XCTAssertTrue(message.waitForExistence(timeout: 10))
        let width = message.frame.width
        message.tap(); message.typeText("Focus zoom check")
        XCTAssertTrue(scale.waitForExistence(timeout: 5))
        XCTAssertEqual(message.frame.width, width, accuracy: 1)
        let done = app.buttons["Done"].firstMatch
        if done.exists { done.tap() } else { app.staticTexts["Main Chat"].firstMatch.tap() }
        XCTAssertTrue(scale.exists)
        app.buttons["To-do"].tap()
        let note = app.textViews["Note content"]
        XCTAssertTrue(note.waitForExistence(timeout: 10))
        note.tap(); note.typeText(" Note focus check")
        XCTAssertTrue(scale.exists)
        if done.exists { done.tap() } else { app.buttons["Work"].tap() }
        XCTAssertTrue(scale.exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Focus zoom remains 1.00"; screenshot.lifetime = .keepAlways; add(screenshot)
    }

}
