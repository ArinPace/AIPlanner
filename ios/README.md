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
