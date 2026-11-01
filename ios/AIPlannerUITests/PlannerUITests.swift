import XCTest

final class PlannerUITests: XCTestCase {
    private func launch(signedIn: Bool = true, resumeSync: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture"] + (signedIn ? ["-UITestSignedIn"] : []) + (resumeSync ? ["-UITestResumeSync"] : [])
        app.launch(); return app
    }
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: XCUIApplication().screenshot())
        screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testLoginAndExistingAccount() {
        let app = launch(signedIn: false)
        XCTAssertTrue(app.buttons["Continue with Google"].waitForExistence(timeout: 40))
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

}
