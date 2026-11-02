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
    func testTaskControlWidgetFlow() {
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn", "-UITestWidgets", "-UITestAtomicWidgetPlan"]
        app.launch()
        XCTAssertTrue(app.webViews.buttons["Agent"].waitForExistence(timeout: 15))
        Thread.sleep(forTimeInterval: 3)
        XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        func visibleButton(_ name: String) -> XCUIElement? {
            home.buttons.matching(identifier: name).allElementsBoundByIndex.first { $0.exists && $0.isHittable }
        }
        func findWidgetPage(_ name: String) -> Bool {
            for _ in 0..<4 { if visibleButton(name) != nil { return true }; home.swipeRight() }
            for _ in 0..<5 { if visibleButton(name) != nil { return true }; home.swipeLeft() }
            return false
        }
        func addWidget(_ name: String) {
            let icons = home.icons.matching(identifier: "AI Planner").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')"))
            for _ in 0..<4 { home.swipeRight() }
            for _ in 0..<5 {
                if icons.allElementsBoundByIndex.contains(where: { $0.isHittable }) { break }
                home.swipeLeft()
            }
            let icon = icons.allElementsBoundByIndex.first { $0.isHittable }!
            icon.press(forDuration: 1.5)
            if home.buttons["Edit Home Screen"].exists { home.buttons["Edit Home Screen"].tap() }
            if home.buttons["Edit"].exists { home.buttons["Edit"].tap() }
            if home.buttons["Add Widget"].exists { home.buttons["Add Widget"].tap() }
            let search = home.searchFields["Search Widgets"]
            XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("AI Planner")
            let result = home.buttons["AI Planner"].firstMatch
            if result.waitForExistence(timeout: 3) { result.tap() }
            else { home.staticTexts["AI Planner"].firstMatch.tap() }
            let preview = home.buttons["AI Planner, " + name]
            for _ in 0..<8 {
                if preview.exists { break }
                home.buttons.matching(NSPredicate(format: "label BEGINSWITH 'AI Planner,'")).firstMatch.swipeLeft()
            }
            XCTAssertTrue(preview.waitForExistence(timeout: 5))
            home.buttons[" Add Widget"].tap()
            if home.buttons["Done"].waitForExistence(timeout: 5) { home.buttons["Done"].tap() }
        }
        if !findWidgetPage("Increase task time") { addWidget("Task & Time") }
        if !findWidgetPage("Finish current task") { addWidget("Done") }
        XCTAssertTrue(findWidgetPage("Increase task time"))
        let plus = visibleButton("Increase task time")!
        let minus = visibleButton("Decrease task time")!
        let value = visibleButton("combinedTaskTimeValue")!
        func expectValue(_ number: String) {
            let updated = expectation(for: NSPredicate(format: "value == %@", number), evaluatedWith: value)
            wait(for: [updated], timeout: 6)
        }
        XCTAssertTrue(plus.waitForExistence(timeout: 10))
        plus.tap(); expectValue("35")
        plus.tap(); expectValue("45")
        minus.tap(); expectValue("35")
        minus.tap(); expectValue("25")
        for _ in 0..<6 { minus.tap() }
        expectValue("0")
        plus.tap(); plus.tap(); expectValue("10")
        Thread.sleep(forTimeInterval: 2)
        let widgets = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        widgets.name = "Task controls and separate Done widget"; widgets.lifetime = .keepAlways; add(widgets)
        value.tap()
        XCTAssertTrue(app.webViews.staticTexts["Widget feedback received: time"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Widget time updated.'")).firstMatch.waitForExistence(timeout: 10))
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(value.waitForExistence(timeout: 10)); XCTAssertEqual(value.value as? String, "10")
        app.activate()
        let publish = app.webViews.buttons["Publish reviewed fixture plan"]
        XCTAssertTrue(publish.waitForExistence(timeout: 10)); publish.tap()
        Thread.sleep(forTimeInterval: 2)
        XCUIDevice.shared.press(.home)
        let adopted = expectation(for: NSPredicate(format: "value == '8'"), evaluatedWith: value)
        wait(for: [adopted], timeout: 10)
        XCTAssertTrue(findWidgetPage("Finish current task"))
        let done = visibleButton("Finish current task")!
        done.tap()
        XCTAssertTrue(app.webViews.staticTexts["Widget feedback received: done"].waitForExistence(timeout: 15))
    }
    func testFillFreeTimeWidget() {
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn", "-UITestWidgets", "-UITestFreeTime"]
        app.launch()
        XCTAssertTrue(app.webViews.buttons["Agent"].waitForExistence(timeout: 15))
        Thread.sleep(forTimeInterval: 3)
        XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        func visible() -> XCUIElement? { home.buttons.matching(identifier: "Fill my free time").allElementsBoundByIndex.first { $0.isHittable } }
        func locate() -> Bool {
            for _ in 0..<4 { if visible() != nil { return true }; home.swipeRight() }
            for _ in 0..<5 { if visible() != nil { return true }; home.swipeLeft() }
            return false
        }
        if !locate() {
            let icons = home.icons.matching(identifier: "AI Planner").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')"))
            for _ in 0..<4 { home.swipeRight() }
            for _ in 0..<5 { if icons.allElementsBoundByIndex.contains(where: { $0.isHittable }) { break }; home.swipeLeft() }
            icons.allElementsBoundByIndex.first { $0.isHittable }!.press(forDuration: 1.5)
            if home.buttons["Edit Home Screen"].exists { home.buttons["Edit Home Screen"].tap() }
            home.buttons["Edit"].tap(); home.buttons["Add Widget"].tap()
            let search = home.searchFields["Search Widgets"]
            XCTAssertTrue(search.waitForExistence(timeout: 5));search.tap();search.typeText("AI Planner")
            if home.buttons["AI Planner"].firstMatch.waitForExistence(timeout: 3) { home.buttons["AI Planner"].firstMatch.tap() }
            else { home.staticTexts["AI Planner"].firstMatch.tap() }
            let preview = home.buttons["AI Planner, Tell me what to do"]
            for _ in 0..<8 { if preview.exists { break }; home.buttons.matching(NSPredicate(format: "label BEGINSWITH 'AI Planner,'")).firstMatch.swipeLeft() }
            XCTAssertTrue(preview.waitForExistence(timeout: 5));home.buttons[" Add Widget"].tap()
            if home.buttons["Done"].waitForExistence(timeout: 5) { home.buttons["Done"].tap() }
        }
        XCTAssertTrue(locate())
        let button = visible()!
        XCTAssertTrue(button.isEnabled)
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot());image.name = "Tell me what to do during free time";image.lifetime = .keepAlways;add(image)
        button.tap()
        XCTAssertTrue(app.webViews.staticTexts["Widget feedback received: free"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Sent to your agent to fill this free-time slot.'")).firstMatch.waitForExistence(timeout: 10))
        app.terminate()
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn", "-UITestWidgets"]
        app.launch()
        XCTAssertTrue(app.webViews.buttons["Agent"].waitForExistence(timeout: 15));Thread.sleep(forTimeInterval: 3)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(home.staticTexts["Available during free time"].waitForExistence(timeout: 15))
        XCTAssertFalse(home.buttons["Fill my free time"].exists)
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
        let locationToggle = app.switches["Use location rules"]
        if locationToggle.exists && (locationToggle.value as? String) == "1" { locationToggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
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
    func testScreenTimePhotosOnlyEnforcement() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_PHOTOS_BLOCK"] == "1", "Enable PLANNER_VERIFY_PHOTOS_BLOCK for the Photos-only OS integration diagnostic.")
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn", "-UITestPolicyRecovery"]
        app.launch(); app.webViews.buttons["Screen Time"].tap()
        if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() }
        app.buttons["Choose apps"].tap()
        let done = app.buttons["Done"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 15))
        let creativity = app.staticTexts["Creativity"].firstMatch
        XCTAssertTrue(creativity.waitForExistence(timeout: 10))
        creativity.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.width - creativity.frame.minX - 40, dy: creativity.frame.height / 2)).tap()
        let photos = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Photos")).firstMatch
        var offered = photos.waitForExistence(timeout: 5)
        if !offered {
            let search = app.searchFields.firstMatch
            search.tap(); search.typeText("Photos")
            offered = photos.waitForExistence(timeout: 5)
        }
        print("PHOTOS_PICKER_AVAILABLE", offered, app.debugDescription)
        let pickerShot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        pickerShot.name = "Photos selection in Creativity"; pickerShot.lifetime = .keepAlways; add(pickerShot)
        guard offered else {
            if !done.exists && app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
            done.tap()
            XCTFail("Photos is absent from Apple's picker. No blocking session was started.")
            return
        }
        let all = app.descendants(matching: .any).matching(identifier: "All Apps & Categories").firstMatch
        if !(all.isSelected || (all.value as? String) == "1") { all.tap() }
        all.tap()
        photos.tap(); done.tap()
        XCTAssertTrue(app.staticTexts["1 apps · 0 categories · 0 websites"].waitForExistence(timeout: 5), "Only Photos may be selected.")
        app.buttons["Start blocking"].tap()
        XCTAssertTrue(app.buttons["End blocking"].waitForExistence(timeout: 5))
        defer { app.activate(); app.webViews.buttons["Screen Time"].tap(); if app.buttons["End blocking"].exists { app.buttons["End blocking"].tap() } }
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons.matching(identifier: "Photos").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
        XCTAssertTrue(icon.waitForExistence(timeout: 5)); icon.tap()
        let photoApp = XCUIApplication(bundleIdentifier: "com.apple.mobileslideshow")
        XCTAssertTrue(photoApp.staticTexts["Restricted"].waitForExistence(timeout: 5) || home.staticTexts["Restricted"].exists)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "Photos actual iOS restriction"; shot.lifetime = .keepAlways; add(shot)
    }
    func testScreenTimeLocationPreferencePersistence() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_BLOCK"] == "1" || ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_SETTINGS"] == "1", "Run after configuring a sample location on the test simulator.")
        let app = launch()
        app.webViews.buttons["Screen Time"].tap()
        let toggle = app.switches["Use location rules"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        if (toggle.value as? String) != "1" { toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        XCTAssertTrue(app.buttons["chooseFocusLocation"].exists)
        app.buttons["Allow only here"].tap()
        let precise = app.switches["Periodic precise checks"]
        for _ in 0..<4 { if precise.exists && precise.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(precise.exists)
        if (precise.value as? String) != "1" { precise.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        app.terminate(); app.launch(); app.webViews.buttons["Screen Time"].tap()
        XCTAssertEqual(toggle.value as? String, "1")
        XCTAssertTrue(app.buttons["Allow only here"].isSelected)
        XCTAssertTrue(app.buttons["chooseFocusLocation"].exists)
        for _ in 0..<4 { if precise.exists && precise.isHittable { break }; app.swipeUp() }
        XCTAssertEqual(precise.value as? String, "1")
        app.swipeDown(); app.swipeDown()
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    }
    func testScreenTimeLocationAddressSearch() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_SEARCH"] == "1", "This test uses Apple's live place search.")
        let app = launch()
        app.webViews.buttons["Screen Time"].tap()
        let toggle = app.switches["Use location rules"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        if (toggle.value as? String) != "1" { toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        app.buttons["chooseFocusLocation"].tap()
        let query = app.textFields["focusPlaceQuery"]
        query.tap(); query.typeText("Washington Square Park, New York")
        app.buttons["focusPlaceSearch"].tap()
        let result = app.buttons["focusPlaceResult-0"]
        XCTAssertTrue(result.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(result.label.localizedCaseInsensitiveContains("Washington"))
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = "Address search results"; shot.lifetime = .keepAlways; add(shot)
        result.tap()
        XCTAssertTrue(app.buttons["chooseFocusLocation"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["chooseFocusLocation"].label.localizedCaseInsensitiveContains("Washington"))
        if (toggle.value as? String) == "1" { toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
    }
    private func startLocationSession(allowOnly: Bool, shortLease: Bool = false, periodic: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["AI_PLANNER_TEST_ORIGIN"] = "http://127.0.0.1:5174"
        app.launchArguments = ["-UITestFixture", "-UITestSignedIn"] + (shortLease ? ["-UITestShortLocationLease"] : []) + (periodic ? ["-UITestPeriodicLocation"] : [])
        app.launch()
        app.webViews.buttons["Screen Time"].tap()
        let existingStop = app.buttons["End blocking"]
        for _ in 0..<3 { if existingStop.exists { break }; app.swipeUp() }
        if existingStop.exists { existingStop.tap() }
        app.swipeDown(); app.swipeDown()
        app.buttons["Choose apps"].tap()
        let all = app.descendants(matching: .any).matching(identifier: "All Apps & Categories").firstMatch
        XCTAssertTrue(all.waitForExistence(timeout: 10))
        if !(all.isSelected || (all.value as? String) == "1") { all.tap() }
        app.buttons["Done"].tap()
        let toggle = app.switches["Use location rules"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        if (toggle.value as? String) != "1" { toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        app.buttons[allowOnly ? "Allow only here" : "Block only here"].tap()
        let choose = app.buttons["chooseFocusLocation"]
        XCTAssertTrue(choose.waitForExistence(timeout: 5)); choose.tap()
        app.buttons["Use current location"].tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Use current location"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 15), .completed)
        let precise = app.switches["Periodic precise checks"]
        for _ in 0..<4 { if precise.exists && precise.isHittable { break }; app.swipeUp() }
        let wantPrecise = allowOnly || ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOW_POWER"] != "1"
        if ((precise.value as? String) == "1") != wantPrecise { precise.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
        let start = app.buttons["Start blocking"]
        for _ in 0..<5 { if start.exists && start.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(start.exists); start.tap()
        let status = app.staticTexts["focusLocationStatus"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        return app
    }
    private func endLocationSession(_ app: XCUIApplication) {
        app.activate(); app.webViews.buttons["Screen Time"].tap()
        let stop = app.buttons["End blocking"]
        for _ in 0..<5 { if stop.exists && stop.isHittable { break }; app.swipeUp() }
        if stop.exists { stop.tap() }
        app.swipeDown(); app.swipeDown()
        let toggle = app.switches["Use location rules"]
        if toggle.exists && (toggle.value as? String) == "1" { toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
    }
    func testScreenTimeLocationBoundaryEnforcement() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_BLOCK"] == "1", "Run with the host simulator-location driver.")
        continueAfterFailure = true
        let app = startLocationSession(allowOnly: false)
        let status = app.staticTexts["focusLocationStatus"]
        defer { endLocationSession(app) }
        let inside = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Blocking at selected location"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [inside], timeout: 15), .completed, app.debugDescription)
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons.matching(identifier: "Calendar").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
        XCTAssertTrue(icon.waitForExistence(timeout: 5)); icon.tap()
        let calendar = XCUIApplication(bundleIdentifier: "com.apple.mobilecal")
        XCTAssertTrue(calendar.staticTexts["Restricted"].waitForExistence(timeout: 5) || home.staticTexts["Restricted"].exists)
        let blockedShot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); blockedShot.name = "Inside location — blocked"; blockedShot.lifetime = .keepAlways; add(blockedShot)
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        print("LOCATION_TEST_MOVE_OUTSIDE")
        let unblocked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "NOT (value CONTAINS[c] 'Timed out')"), object: icon)
        XCTAssertEqual(XCTWaiter.wait(for: [unblocked], timeout: 45), .completed, "Location exit must clear shields while Planner is in the background.")
        icon.tap()
        XCTAssertFalse(calendar.staticTexts["Restricted"].waitForExistence(timeout: 2) || home.staticTexts["Restricted"].exists)
        let outsideShot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); outsideShot.name = "Outside location — available"; outsideShot.lifetime = .keepAlways; add(outsideShot)
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        print("LOCATION_TEST_MOVE_INSIDE")
        let reblocked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value CONTAINS[c] 'Timed out'"), object: icon)
        XCTAssertEqual(XCTWaiter.wait(for: [reblocked], timeout: 45), .completed, "Location entry must reapply shields in the background.")
        icon.tap(); XCTAssertTrue(calendar.staticTexts["Restricted"].waitForExistence(timeout: 5) || home.staticTexts["Restricted"].exists)
    }
    func testScreenTimeLibraryOnlyEnforcement() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_BLOCK"] == "1", "Use the host location driver.")
        continueAfterFailure = true
        let app = startLocationSession(allowOnly: true)
        defer { endLocationSession(app) }
        let status = app.staticTexts["focusLocationStatus"]
        let allowed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "At allowed location · apps available"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [allowed], timeout: 20), .completed, app.debugDescription)
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons.matching(identifier: "Calendar").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
        XCTAssertTrue(icon.waitForExistence(timeout: 5)); icon.tap()
        let calendar = XCUIApplication(bundleIdentifier: "com.apple.mobilecal")
        XCTAssertFalse(calendar.staticTexts["Restricted"].waitForExistence(timeout: 2) || home.staticTexts["Restricted"].exists)
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        print("LOCATION_TEST_MOVE_OUTSIDE")
        let blocked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value CONTAINS[c] 'Timed out'"), object: icon)
        XCTAssertEqual(XCTWaiter.wait(for: [blocked], timeout: 45), .completed)
        icon.tap(); XCTAssertTrue(calendar.staticTexts["Restricted"].waitForExistence(timeout: 5) || home.staticTexts["Restricted"].exists)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = "Library rule — blocked outside"; shot.lifetime = .keepAlways; add(shot)
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        print("LOCATION_TEST_MOVE_INSIDE")
        let restored = XCTNSPredicateExpectation(predicate: NSPredicate(format: "NOT (value CONTAINS[c] 'Timed out')"), object: icon)
        XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 45), .completed)
        icon.tap(); XCTAssertFalse(calendar.staticTexts["Restricted"].waitForExistence(timeout: 2) || home.staticTexts["Restricted"].exists)
    }
    func testScreenTimeLocationLeaseExpiresWithoutPlanner() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_LEASE"] == "1", "Enable the system verification-expiry diagnostic.")
        continueAfterFailure = true
        let began = Date().timeIntervalSince1970
        let app = startLocationSession(allowOnly: true, shortLease: true)
        defer { endLocationSession(app) }
        let status = app.staticTexts["focusLocationStatus"]
        let allowed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "At allowed location · apps available"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [allowed], timeout: 20), .completed, app.debugDescription)
        app.terminate()
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons.matching(identifier: "Calendar").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
        XCTAssertTrue(icon.waitForExistence(timeout: 5))
        let expired = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value CONTAINS[c] 'Timed out'"), object: icon)
        XCTAssertEqual(XCTWaiter.wait(for: [expired], timeout: 65), .completed, "Access must expire without a running Planner process.")
        XCTAssertEqual(app.state, .notRunning)
        icon.tap()
        let calendar = XCUIApplication(bundleIdentifier: "com.apple.mobilecal")
        XCTAssertTrue(calendar.staticTexts["Restricted"].waitForExistence(timeout: 5) || home.staticTexts["Restricted"].exists)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = "Expired library access — Planner terminated"; shot.lifetime = .keepAlways; add(shot)
        app.launch(); app.webViews.buttons["Screen Time"].tap()
        let marker = app.staticTexts["focusLeaseExpiry"]
        for _ in 0..<5 { if marker.exists { break }; app.swipeUp() }
        XCTAssertGreaterThan(Double(marker.label) ?? 0, began, "Only the DeviceActivity extension writes this expiry marker.")
    }
    func testScreenTimePeriodicBackgroundVerification() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PLANNER_VERIFY_LOCATION_PERIODIC"] == "1", "This real background check takes over three minutes.")
        continueAfterFailure = true
        let app = startLocationSession(allowOnly: true, periodic: true)
        defer { endLocationSession(app) }
        let status = app.staticTexts["focusLocationStatus"]
        let allowed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "At allowed location · apps available"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [allowed], timeout: 20), .completed)
        let began = Date().timeIntervalSince1970
        XCUIDevice.shared.press(.home); XCUIDevice.shared.press(.home)
        print("LOCATION_TEST_WAITING_FOR_PERIODIC_CHECK")
        let elapsed = expectation(description: "Actual three-minute background verification")
        DispatchQueue.main.asyncAfter(deadline: .now() + 190) { elapsed.fulfill() }
        wait(for: [elapsed], timeout: 200)
        let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let icon = home.icons.matching(identifier: "Calendar").matching(NSPredicate(format: "NOT (value CONTAINS[c] 'Widget')")).firstMatch
        XCTAssertTrue(icon.waitForExistence(timeout: 5))
        XCTAssertFalse((icon.value as? String)?.contains("Timed out") ?? true, "Access should remain available after automatic re-verification, beyond the original lease.")
        icon.tap()
        let calendar = XCUIApplication(bundleIdentifier: "com.apple.mobilecal")
        XCTAssertFalse(calendar.staticTexts["Restricted"].waitForExistence(timeout: 2) || home.staticTexts["Restricted"].exists)
        app.activate(); app.webViews.buttons["Screen Time"].tap()
        let marker = app.staticTexts["focusBackgroundVerification"]
        for _ in 0..<5 { if marker.exists { break }; app.swipeUp() }
        XCTAssertGreaterThan(Double(marker.label) ?? 0, began + 120, "A fresh validated GPS fix must have completed while Planner was still backgrounded.")
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
