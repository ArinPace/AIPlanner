# AI Planner for iPhone

Open [AIPlanner.xcodeproj](AIPlanner.xcodeproj) in Xcode, select the **AIPlanner** scheme and an iPhone simulator, and press Run. The minimum OS is iOS 17; Simulator checks cover iOS 18.5 and iOS 27.2; the current toolchain is Xcode 27.2.

From the repository root, `npm run ios` builds, installs and launches an available iPhone simulator. No Apple Developer membership or signing identity is needed for the simulator. A specific simulator UUID can be supplied to `scripts/run-ios-simulator.sh`.

## Shared changes and updates

Unless the user specifically requests a web-only or iOS-only change, implement shared feature and behavior changes for both. The native app loads the production frontend, so deployed web-interface and backend changes reach both clients when the page is next loaded. Saved account data is shared immediately through the existing revision-checked backend. A deployment does not replace an already open page mid-edit; reopen the app to load the new interface safely.

Swift code, permissions, URL schemes and other native configuration changes require a new signed app build. During development use Xcode Run; for regular beta distribution use TestFlight, and later App Store updates. Replacing a signed build while retaining the same app identity preserves the existing account-backed data. Do not automatically reload a page while the user is typing.

Xcode 27 uses Device Hub for simulator windows; the launch script supports Device Hub and the older Simulator app. Physical-device signing requires the owner's Apple Account/team and device trust/Developer Mode. No signing secrets or personal team settings should be committed.

## What this app contains

This is a native SwiftUI/WebKit container for the existing, mobile-responsive Planner frontend. It uses the same hosted application and backend, rather than a separate database or rewritten calendar. Calendar, Files, To-do, Work, Agent, note/calendar history, recurring folders, tags, attachments, planning settings and staged Google sync use the existing account and permissions. The experimental extension-based **Chat** tab is neither shown nor mounted in the iPhone app; the ordinary Agent conversation remains available.

The app requires an internet connection. The interface is loaded from `https://aiplanner-ten.vercel.app`; web and server updates reach the app without copying the frontend into a second project. Email/username login uses the existing account, password and data. No API key or backend secret is embedded in the application.

Native integration includes:

- Persistent WebKit account storage, keyboard-aware SwiftUI layout and system safe areas.
- Google login and Google Calendar authorization through `ASWebAuthenticationSession`, with a verified return into the app. Login uses a short-lived, proof-bound handoff; session tokens do not appear in callback URLs.
- Calendar/staging JSON exports through the iPhone share sheet. Other downloadable files use WebKit downloads and the same share sheet.
- WebKit's file/photo selection, microphone permission and JavaScript confirmation dialogs.
- External links and existing remote-browser live views open in an in-app Safari sheet. This does not create a new agent-controlled browser.
- Connection errors offer a retry without deleting account data.

## Run on your own iPhone

1. Open `AIPlanner.xcodeproj` in Xcode.
2. Under **AIPlanner > Signing & Capabilities**, select your own Apple development team. Use a unique bundle identifier if Xcode requires it; keep the callback scheme `aiplanner`.
3. Connect your iPhone, select it as the run destination and enable Developer Mode on it if requested.
4. Press Run and sign in using the existing Planner account. Google account login and Calendar editing consent are separate flows.

Signing credentials, personal team identifiers, device registrations and account passwords are not checked into this repository. App Store/TestFlight submission and signing have not been performed.

## Agent requirements: separate next phase

The Agent tab currently uses the **existing** Planner agent runtime and saved browser connections. This iPhone app does not replace that runtime, eliminate its VM dependency, or implement a new subscription transport.

The intended future agent must use the user's ChatGPT subscription and retain an authenticated browser session for Brightspace and other services. Official subscription access eligibility and supported mobile authentication need validation. The currently documented subscription inference route does not itself provide ChatGPT's hosted computer-use/browser or connectors. Candidate next steps are a foreground native WebKit browser exposed through explicit agent tools, or authorized service integrations/MCP tools. Browser sign-in and MFA must stay in a secure user-controlled form; do not transmit passwords as chat messages. iOS background suspension and unattended scheduling require a separate design.

## Verification

The UI-test target runs the actual frontend from a loopback Vite server with isolated API fixtures. It never logs into or edits a real user's account. Start `npm run dev -- --host 127.0.0.1 --port 5174`, then run the **AIPlanner** scheme's tests in Xcode. Tests cover sign-in, Google sign-in cancellation, omission of Chat, the other Planner tabs, calendar event creation, native JSON sharing, foreground sync, and text-field focus/dismissal without viewport zoom.

The fixture loader exists only under `#if DEBUG` and additionally requires an explicit UI-test launch argument and a loopback app origin. Release builds always use the production origin.

Server tests for the native OAuth proof binding, expired/replayed ticket handling, strict Google connection scopes and callback state can be run with:

```sh
npx --yes tsx@4.21.0 --test server/native-auth.test.ts server/account-auth.test.ts server/google-accounts.test.ts
```

Physical-device microphone/camera, Google consent and real student-site login require device/account testing. Simulator fixture tests do not establish that Brightspace or Duo login works.

## Home Screen and Lock Screen widgets

The embedded **PlannerWidgets** extension provides **Current Task** and **Time Remaining**. Both support small/medium Home Screen and rectangular/inline Lock Screen layouts; Time Remaining also has a circular Lock Screen layout. Add either widget through the iPhone's normal widget picker after installing the new native build.

Both targets must enable App Groups with `group.com.arinpace.aiplanner`, using the same signing team. This capability needs the paid developer membership for physical-device provisioning; simulator builds need no membership. Signing details remain local.

The signed-in app exports a seven-day, read-only schedule into the App Group. It uses the calendar's existing occurrence expansion, including recurring folder children and exclusions, and omits folder containers, all-day items and reminders. Widgets are independent of calendar visibility filters. Where timed activities overlap, the latest-starting activity wins, then the one ending first. The app clears the snapshot on sign-out. No login tokens or credentials are shared with the extension.

Timeline entries switch activities at their start/end boundaries. SwiftUI's system countdown continues while the extension is asleep and stops at zero. iOS controls when widget timelines are displayed/refreshed. Changes from other devices require the iPhone app to sync; the widget does not poll the account backend independently. After seven days without opening Planner it asks to sync instead of showing an obsolete schedule. There is no background agent/VM requirement for the cached countdown.

Verification: `npx tsx --test tests/widget-snapshot.test.ts`; native model checks: `swiftc ios/Shared/WidgetSchedule.swift ios/Shared/WidgetScheduleTests.swift -o /tmp/planner-widget-tests && /tmp/planner-widget-tests`. Build the AIPlanner scheme to compile and embed both widgets.

## Updating local copy and widget sync status

Successful calendar and Files reads/writes maintain a read-only, account-bound IndexedDB snapshot on both web and iPhone. Native builds additionally mirror those snapshots to a protected `Application Support/Planner Local Copy/replica.json`. The mirror includes calendar events/tags/recurrences, full note text/rich text, folders and document metadata; it does not bulk-download PDF attachments, chat history or version-history archives. Account changes and explicit sign-out clear the previous copy. Network failures preserve the last successful copy. Older revisions and responses from a previous login cannot replace newer/account-switched data. Cached data is never silently submitted to the backend.

Calendar refresh remains active on other tabs (once a minute), guarded against unsaved calendar edits; Files copies refresh in the background every five minutes while visible, and through the existing Files refresh/save flow. The native widget feed now follows successful calendar responses rather than an optimistic UI effect. Unchanged revisions avoid repeated copy writes and unchanged widget schedules avoid frequent reload requests. Widget timelines and native countdown text keep progressing without the app running; iOS still controls timeline refresh and remote changes require a subsequent app sync.

Settings shows local-copy timestamps, widget sync/availability status, a sync action and JSON export. Native sharing failures are displayed instead of being silently swallowed. Old native builds can still receive widget schedules, but must be updated for the full native mirror/status features. The widget gallery uses the actual saved schedule where available and explicitly names fallback preview content "Example task".

Current Task uses the calendar task's tag colour and matching contrast text on the Home Screen. Lock Screen and user-selected tinted widget modes follow iOS colour restrictions. Verify local snapshot isolation and network/revision safety with `node tests/local-replica.mjs` against the loopback Vite server.

### Live countdown verification

Use SwiftUI's `TimeDataSource.currentDate` with a second-precision countdown format on iOS 18+, with the dynamic date timer style on iOS 17. These are system-driven text updates; do not replace them with polling the backend or a once-per-second widget timeline. Native page loading also requests a timeline refresh so newly installed widget code is picked up. Task titles remain marked privacy-sensitive without redacting the entire dynamic timer view.

Testing on 2026-10-31: actual placed Home Screen widgets display the real calendar task and its tag colour. The user confirmed that the countdown ticks on the clean iOS 18.5 simulator. On the iPhone 18 Pro/iOS 27.2 (24B8117) simulator, all three supported dynamic-time implementations froze while continuously visible, including with normal Home Screen backgrounding. Do not report continuous ticking on that runtime as verified or fixed; the comparison points to a runtime-specific issue, and physical-device iOS 27.2 verification remains outstanding. The isolated simulator named “Planner timer test — iOS 18.5” uses loopback fixture data, not the user's account.

### Combined small widget and simulator diagnostics

**Task & Time** is the first widget in the gallery. It supports the small Home Screen size and rectangular Lock Screen size, showing the current activity, its start/end times, and the live countdown together. Its Home Screen background follows the task's calendar colour.

The 2026-10-31 investigation also reproduced the freeze with a short sample task on a clean iOS 27.2 device; schedule size and overnight duration are not sufficient explanations. The user observed that Home Screen edit-mode jiggle also stopped for system apps on iOS 27.2 while all icons animated on iOS 18.5. Xcode 27.2's first-launch setup completed, the Mac meets its macOS 26.6 minimum, Reduce Motion was disabled, `com.apple.UIKit.SimulatorSlowMotionAnimationState` was 0, and the display reported 60 Hz with GPU rendering enabled. This points to a simulator rendering/animation problem but is not a confirmed root cause. Do not disable current-iOS support or claim the timer was fixed based only on old-iOS results.

Restarting the user-level CoreSimulator service preserved simulator data; the root-owned CoreSimulator service required administrator authentication and could not be restarted automatically. No Apple binaries were modified. Unused duplicate iOS 27.2 Duo runtime variants were removed using `simctl runtime delete`; the standard iOS 27.2 runtime and device data were retained. A separate iOS 27.1 Duo runtime was installed for comparison. Temporary minimal-widget probes and UI-test methods must not be shipped.

### Task & Time widget

The combined widget shows the activity title, beginning and ending times, and countdown in a single small Home Screen widget. The same information fits a rectangular Lock Screen widget, with the extra header omitted there. Its Home Screen background uses the current task colour; existing separate widget kinds remain available.

The compatibility investigation also checked `com.apple.UIKit.SimulatorSlowMotionAnimationState` (0), absent animation-disable launch variables, enabled Metal acceleration, normal display refresh, and completed Xcode first-launch setup. Both simulator and generic physical-iPhone builds succeeded. The user reported stopped Home Screen edit-mode jiggle on iOS 27.2 even without Planner open, so this is not yet established to be an app-only timer problem. After shutting down the simulators, the user restarted the administrator-owned CoreSimulator service on 2026-10-31; both simulator service processes then had fresh start times. Compatibility must be judged by the subsequent visible Home Screen test, not by a successful build alone. No diagnostic-only bare countdown or temporary XCTest methods are included in the final source.

Post-service-restart check: screenshots of the placed combined and separate timer widgets on the real-account iPhone 18 Pro simulator showed the same countdown value six seconds apart. The combined layout, colour and start/end times were visually verified. This observation does not verify continuous ticking. A host Mac restart was requested as the next environment-reset step; its result is outstanding. Temporary read-only screenshot XCTest methods were removed after collecting evidence.


### Screen Time app blocking

Screen Time appears next to Agent in the authenticated iPhone Planner navigation. It is absent before login and in ordinary web browsers. The native panel uses individual Family Controls authorization, Apple's FamilyActivityPicker, a named ManagedSettings shield store, and the FocusMonitor Device Activity extension. Sessions are 15–720 minutes. End blocking clears restrictions immediately; the monitor clears them after the interval even when Planner is terminated. Opaque selections and session state stay in the existing on-device App Group.

Verification on November 1, 2026:

- iOS 18.5: selecting All Apps & Categories with the production shield policy actually restricts Calendar. Tests tap its real Home Screen icon, verify Apple's Restricted screen replaces app content, then verify access returns after clearing. The app remains usable to end blocking.
- iOS 18.5: Apple's picker exposes categories but no individual installed apps, including a separately installed test application, even after App & Website Activity was enabled. A single-category Calendar test fails. Per-app/category-scoped enforcement is therefore not verified; blanket shielding is not evidence of scoped shielding.
- iOS 26.5: authorization, picker, persistence, early stop and authenticated navigation passed. Actual Calendar shielding failed. The real 15-minute expiry passed with Planner terminated: FocusMonitor ran one second after the saved deadline.
- Both runtime versions lack the coreduet knowledge service referenced by picker error logs; no Apple frameworks or daemon configurations were patched.

The launcher prefers iOS 18.5; passing a simulator UDID overrides it. Start the loopback fixture server on port 5174 and run `scripts/test-ios-screen-time.sh <udid>` for setup, picker, validation and persistence checks. `PLANNER_VERIFY_OS_SHIELDS=1` adds actual Home Screen enforcement and restoration (verified on 18.5). `PLANNER_VERIFY_BACKGROUND_EXPIRY=1` adds the real 15-minute extension expiry test. `PLANNER_VERIFY_CATEGORY_SHIELDS=1` separately runs the currently failing scoped-category diagnostic. OS enforcement diagnostics have a DEBUG-only, simulator-only 30-second recovery to avoid leaving the test device restricted; the normal app uses the requested DeviceActivity schedule.

Both app and FocusMonitor require the Family Controls entitlement. A Personal Team cannot provision it; physical-device testing requires a suitable paid team. Distribution approval is required for both targets before TestFlight/App Store distribution. The widget extension does not need Family Controls. No timer or custom overlay is treated as proof of OS app blocking.

#### App picker investigation — November 2, 2026

The app now uses Apple's `familyActivityPicker(isPresented:selection:)` presentation directly, without the extra NavigationStack sheet, and refreshes individual authorization before opening it. Permission failures remain visible; an unsuccessful authorization does not open the picker. Screen Time's one-second refresh pauses while the picker is open. Reopening the picker and session persistence/early stop passed on 18.5.

A DEBUG simulator-only reproduction (`-UITestStandalonePicker`) removes the web view, persisted selections, category expansion mode and polling entirely. It uses a new `FamilyActivitySelection()`, individual authorization, and Apple's standard presentation. Expanding Other and reopening twice still returns no app entries. The diagnostic XCTest `testStandaloneScreenTimePickerDiagnostics` records this UI as attachments; its passing result verifies the reproduction flow, **not** successful individual-app enumeration.

At 08:50 on November 2 the isolated picker logged `Failed to open usage store ... Store.plist ... no such file`; FamilyControlsAgent separately logged error 4099 looking up `com.apple.coreduetd.knowledge`, with `No such process`. Read-only inspection found no launch job registering that service in the installed 18.5, 26.1, 26.3, 26.5 or 27.2 runtime LaunchDaemons. This is evidence about these local runtimes, not a claim that all Screen Time functionality is unsupported in every simulator. No services were fabricated, no Apple binaries were patched, and no mock app list was substituted for actual enforcement.

References: [Apple picker documentation](https://developer.apple.com/documentation/familycontrols/familyactivitypicker), [Apple's individual authorization walkthrough](https://developer.apple.com/videos/play/wwdc2022/110336/), and a [developer's reproduction of the same simulator-only empty app list](https://stackoverflow.com/questions/78335574/familyactivitypicker-on-ios-simulator-not-populating-apps). The last report's physical-device workaround is user-reported, not an Apple guarantee. A real iPhone provisioned with Family Controls is still needed to verify individual-app selection and scoped enforcement for this app.

### Location-based Screen Time sessions

Inside Screen Time, enable **Use location rules**, choose an address/place or use the phone's current location, and choose a 50–1,000 metre radius. There are two rules:

- **Allow only here**: during the focus session, selected apps are blocked outside the place, while location is unknown, and when the last precise verification expires. They become available only after a fresh precise fix confirms the phone is inside.
- **Block only here**: preserves the previous behavior, blocking selected apps inside the place and allowing them outside. Existing saved location configurations retain this rule on upgrade; new configurations default to Allow only here.

Periodic precise checks default to every three minutes, with 2/3/5/10 minute settings. A check requests `kCLLocationAccuracyBest` for at most 20 seconds and accepts only a fresh fix whose reported uncertainty fits entirely inside or outside the boundary. Between checks the app requests kilometre accuracy with a 50 metre movement filter, letting Core Location choose lower-power positioning. Area crossings and foregrounding also trigger checks. This is a target cadence, not a guarantee of exact background scheduling; iOS can defer execution. Lower-power tracking remains active during the session so the app can receive location events in the background. Hardware power use is controlled by iOS and has not been measured on a physical phone.

Location access is a short **verification lease**, not an indefinite unlock. A separate named DeviceActivity monitor applies the unknown-location policy when the lease expires, even if Planner is terminated. The schedule uses an ongoing interval whose total span is 15 minutes and whose remaining portion ends at the verification deadline; this respects DeviceActivity's minimum total interval. Re-verification replaces that monitor after persisting the new deadline. Delayed callbacks compare the saved deadline, preventing an older callback from revoking a newer verification. The normal session-end monitor independently clears all focus restrictions. Ending a session also stops location updates and cancels verification monitoring.

Always location access, Precise Location and Background App Refresh are required. The UI shows the last reported phone accuracy and the last precise verification time. A good GPS fix can identify a building, but neither a small selected radius nor an accuracy estimate guarantees identification of a building, floor or room. Indoor accuracy and battery consumption need physical-device testing. Bluetooth beacon detection is not included. Saved place/settings and verification timestamps stay in the app's on-device App Group; Planner does not upload a route or location history.

Tests use the dedicated 18.5 simulator, real Core Location/ManagedSettings/DeviceActivity APIs, fixture Planner data and a continuously refreshed sample NYC location feed. They grant **simulator-only** Always permission, so Apple's permission prompts are not verified. Because the simulator's individual-app inventory is empty, restriction checks use All Apps & Categories and actually open Calendar from the Home Screen. Start the fixture server with `npm run dev -- --host 127.0.0.1 --port 5174`, then run:

```
python3 scripts/test-ios-location.py SIMULATOR_UDID --allow-only
python3 scripts/test-ios-location.py SIMULATOR_UDID --lease
python3 scripts/test-ios-location.py SIMULATOR_UDID --periodic
python3 scripts/test-ios-location.py SIMULATOR_UDID
python3 scripts/test-ios-location.py SIMULATOR_UDID --low-power
```

`--allow-only` verifies access inside, actual system restriction after leaving while Planner is backgrounded, and restored access on return. `--lease` uses a DEBUG-only 30-second verification interval, terminates Planner, checks that iOS re-blocks access and asserts a timestamp written only by the monitor extension. `--periodic` waits over three actual minutes in the background and checks both ongoing access beyond the initial lease and a new precise verification completed while the app was still backgrounded. The default and `--low-power` modes test the legacy Block only here rule. Settings persistence is checked afterward. The independent address-search UI test uses live Apple MapKit search when `TEST_RUNNER_PLANNER_VERIFY_LOCATION_SEARCH=1` is passed to xcodebuild. Physical-device precision, battery use, individual-app selection and force-quit recovery still need verification.

### Task & Time controls and Done widget

Add **AI Planner → Task & Time** (small Home Screen or rectangular Lock Screen) and/or **Done** (small Home Screen, circular/rectangular Lock Screen). Both use the activity color on the Home Screen. Minus/plus stage a change by five minutes at 30 minutes remaining or less, or ten minutes above that; zero is the minimum. Tap the countdown itself to apply. There is no keyboard editor or separate submit button. The older Adjust Task widget remains available with the same controls. The start/end range previews the chosen end; the countdown continues ticking.

The separate Done button immediately ends the activity in the local widget display. Both actions send feedback directly from the widget without opening Planner. Open the updated app once while signed in to enable delivery; its existing session is stored in the App Group keychain, never in widget defaults. The widget fetches canonical snapshots during timeline refreshes so it can adopt the merged plan while Planner stays closed; iOS controls refresh timing. Failed or uncertain delivery remains saved for review/retry in Planner and is never silently sent twice. The widget changes immediately; the live calendar waits for one complete, reviewed draft publication. Zero duration alone does not mark a checklist item complete. Newer edits and conflicts with fixed commitments are deferred to the agent rather than overwritten. Recurring activities detach only the selected occurrence, including children of recurring folders. The countdown uses at least two digits in its leading field (for example 09:58 or 00:00), while continuing to tick. The extension reads only the shared keychain session for authenticated Planner requests. Replanning still requires the configured agent host.

A pending request is saved in the App Group until accepted by the chat queue or explicitly dismissed. Account changes clear it. Failed/uncertain delivery is retained with explicit retry, and a persisted delivery marker prevents automatic re-sending after reload. Draft application is idempotent across retries. Active widget drafts block live agent save/delete/replan tools; newly conflicting or duplicated activities block publication. Ambiguous chat retries retain the reference ID, and the agent is instructed to process that ID once; this is not server-enforced exactly-once chat delivery. The adjustment widget footer shows Sending… until the revised plan is merged into the calendar, including after chat delivery. The plus/minus controls are greyed out and inert throughout that period; the native intent also rejects stale taps. They re-enable only when the canonical plan resolves the widget preview.

Checks: `swiftc ios/Shared/WidgetSchedule.swift ios/Shared/WidgetScheduleTests.swift -o /tmp/planner-widget-tests && /tmp/planner-widget-tests`, `npx tsx --test server/widget-task-feedback.test.ts`, and `node scripts/test-widget-feedback.mjs` (development server on port 5174). Run `node scripts/widget-background-fixture.mjs` before `testTaskControlWidgetFlow`; this XCTest verifies a real Home Screen widget POST reaches a loopback fixture while Planner stays in the background. `server/widget-background.test.ts` verifies account scoping, draft-only agent instructions and canonical merge markers.

### Tell me what to do widget

The small Home Screen / rectangular or circular Lock Screen widget offers an agent request only during a verified free slot: an unscheduled gap or an explicitly named, planned **Free time** activity. Other activities, including breaks and buffers, block it; overlaps with any busy event also block it. Signed-out, unsynced and expired schedules do not enable it. Requests end at the next scheduled activity, the explicit free block end, or New York midnight, whichever comes first.

Tapping opens Planner and uses the existing authenticated Main Chat queue. Planner rereads the live calendar and rejects a newly busy or expired slot before sending. The widget itself changes no events. The prompt tells the agent to reread again at execution time, schedule appropriate urgent existing work only inside this window, honor intensity, preserve commitments and avoid fragmented work. Widget timelines refresh from the normal calendar sync when the agent makes changes. The existing pending-request/account isolation and retry behavior apply. `testFillFreeTimeWidget` tests the real Home Screen action with fixture data, followed by its non-interactive busy state.

Widget drafting checks cover the selected occurrence, nested folder membership, unchanged future recurrences, preserved fixed commitments and one atomic publish. Automated overlap/duplicate validation covers the active rolling seven-day window; the agent must also review travel, recovery, deadlines, capacity and any other affected dates. Google publication remains a resumable reviewed batch after the internal atomic switch, not a cross-provider transaction. No new database schema is required.

Before submitting a time adjustment, the interactive widget replaces its countdown with the signed cumulative change (for example +10 min or −5 min) and Press to confirm. The displayed start/end interval stays unchanged until confirmation. Confirming immediately restores the revised live countdown and interval while Sending… remains visible until the full calendar plan is merged.

Widget/local replica identity is reset on logout and account changes; every widget snapshot includes its account and stale-account writes are rejected. Native fixture runs use planner_test and a separate Planner Test Copy directory. Switching between a loopback test origin and the live origin clears widget previews/credentials, and old widget-test fixture previews are removed on upgrade. `node scripts/test-account-replica.mjs` checks logout, lower revisions after switching, stale replies, and widget account scoping.

Interactive updates prioritize the local snapshot for 15 seconds, bypassing calendar GETs during tap-driven redraws. Confirmation schedules a file-backed background URLSession upload and returns immediately; widget/app background-session handlers acknowledge delivery later. Sending… remains until plan publication. Run `PLANNER_WIDGET_FIXTURE_DELAY_MS=30000 node scripts/widget-background-fixture.mjs` with `testTaskControlWidgetFlow` to verify local adjustment/confirmation appear while server acceptance is deliberately delayed.
