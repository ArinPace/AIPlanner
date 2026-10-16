# AI Planner implementation handoff

## Decisions

- Current MVP uses one persistent Hyper-V VM per account, on the Windows host.
- VMs wake for queued work and scheduled checks, then shut down when idle.
- Keep VM-only for testing; do not replace it with a local companion.
- Production: https://aiplanner-ten.vercel.app; repository: ArinPace/AIPlanner.
- Testing account is arin. Never commit credentials or browser session data.
- Recordings are disabled; explicit permission is required to enable them.
- Push completed, verified changes to main as requested by the owner.

## Verified

- Personal ChatGPT authentication through the VM's native Codex device-code flow.
- Actual model chat, multiple chats, Files read/write, Calendar event creation.
- ChatGPT credentials and conversation resume survived a full VM stop/start.
- Background sync job completed with the planner UI closed.
- Private browser view requires an expiring random token; bad tokens return 404.
- Brightspace authenticated access check passed after the owner completed NYU SSO.
- Files and Calendar refresh agent edits without overwriting unsaved drafts.

## Architecture and boundaries

- host/main.mjs polls account-scoped power/provisioning decisions; SYSTEM scheduled
  task AIPlanner-VM-Host starts at Windows boot. Config lives outside the repo in
  LocalAppData/AIPlannerHost with restricted ACLs. Do not print it.
- Existing guest power control uses Hyper-V directly. Multipass is used only for
  provisioning; its management service became stuck StopPending during testing.
- worker/main.mjs runs the per-account lease-bound agent. Native credentials and
  browser profiles stay on its private VM disk, not in Supabase.
- VM worker browser MCP is read-only and restricts navigation to enabled origins.
- Supabase holds account-scoped planner data, job leases, settings, and encrypted
  API credentials. VM tables deny direct browser access.
- Personal ChatGPT subscription connection is owner-only; do not broaden the
  allowlist as a substitute for hosted integration approval.

## Outstanding verification / implementation

- Actual Brightspace course/assignment collection passed: saved a sourced note
  with CS Assignment 2 list evidence and actual assignment detail URL. Detail
  view opened successfully; its Instructions heading had no extracted body or
  attachments, so assignment-specific instructions remain unverified.
  Fixed explicit enabled-source environment forwarding to the Codex browser MCP
  subprocess and waited for NYU SSO intermediary redirects without reading them.
- Saved Brightspace login survived VM restart. The new 7AM/5PM America/New_York
  schedule is enabled for Brightspace; enabling it disabled the legacy schedule.
- Native Hyper-V idle shutdown and automatic job-triggered wake both occurred.
- Multipass recovered after terminating its hung management daemon and restarting
  its service. Existing VM scheduling no longer depends on that daemon.
- Claude selectable provider implemented with unmodified Claude Code 2.1.300.
  Native sign-in launch and private view smoke test passed; actual user sign-in,
  inference, and restart persistence still require verification. The production
  Claude connection has been launched from Setup for the owner to sign in.
  Use unmodified Claude Code and its own authentication flow; do not collect or
  proxy subscription tokens. Current Anthropic legal docs explicitly distinguish
  hosting the unmodified binary from offering a custom Claude.ai OAuth client:
  https://code.claude.com/docs/en/legal-and-compliance
- A real clock-triggered 7AM/5PM execution has not yet been observed; the manual
  background job test does not establish clock execution.

## Validation evidence

Ignored data/ scripts contain production smoke tests and screenshots. They are
not production code. Several tests create artifacts; inspect before rerunning.
Existing test artifacts are the Agent E2E Verification folder, VM connection test
note, and Agent E2E calendar verification event. Preserve unrelated user data.

Build passed; server/browser-access tests passed; lint had two pre-existing
TimeGridView warnings. Re-run checks appropriate to subsequent changes.

## 2026-10-16 account management

- Every supported VM website now has an Accounts list with editable labels,
  reconnect/switch, and removal. Browser sessions are distinguished from previous
  accounts; unknown identities are explicitly labeled rather than inferred from
  messages. Account detection reads only account controls.
- Browser account inventory is private server-side Supabase data with owner-scoped
  API queries/RPCs. Removing an active entry disables that source. Website cookies
  are not revoked by deleting metadata; use the website's account menu to sign out.
- Native Google Calendar OAuth supports multiple encrypted, per-user account grants,
  selection of a default, testing access, removal/revocation, and read-only MCP tools.
  Authorization opens in the user's normal browser, not the automated VM.
- Google Cloud project atlantean-force-511800-c9 has been created. Consent branding
  is External, pending owner acceptance of Google API User Data Policy. Client
  credentials, production publishing/verification and live OAuth remain unfinished.
  Do not represent Calendar OAuth as working until those steps pass.
- Account management desktop/mobile mocked UI tests passed at 1440 and 320 pixels.
  Database transaction checks passed for history, rename/removal and owner isolation;
  RLS enabled, public table/function privileges denied. No test account changes kept.

- Production account API smoke test passed: list, rename/remove an isolated
  temporary record, reject unauthenticated modification, and preserve all five
  enabled sources. Live Verify connections passed all five browser sites.
- Google browser account selection now remembers the /u/N/ slot only (not message
  URLs or credentials) for Gmail, Calendar and Drive, and applies it to subsequent
  read tools and site opening. Tested slot isolation across hosts.

## 2026-10-16 Google OAuth client activation

- Owner completed Google's API User Data Policy consent setup. Created a Web
  OAuth client in atlantean-force-511800-c9 with the production callback
  /api/agent/oauth/callback/google. Client ID/secret are production-only sensitive
  Vercel environment variables; no client secret was saved in the repository.
- Google Calendar API enabled. Configured read-only Calendar plus identity scopes.
  Environment redeployment completed; production reports Google OAuth configured.
- Calendar's main connection button now uses native browser OAuth instead of VM
  sign-in. Existing saved browser accounts remain under their own account controls.
- Google publishing status remains Testing. The Cloud project owner is an initial
  test user; requested confirmation of the intended additional Calendar email.
  Public Google verification and real user consent/callback/API-read are pending.

## 2026-10-16 VM Calendar offline verification

- The confirmed arnavjain824@gmail.com Google account was added to Google's test
  users. The planner now has a completed Calendar OAuth grant, not just an OAuth
  client configuration. Calendar is enabled in the VM's 07:00/17:00 New York schedule.
- Live VM agent test called the account-scoped planner MCP to read the selected
  OAuth Calendar account. Its 96 upcoming events matched the authenticated API
  check. No Google browser session was used. Temporary verification chat deleted.
- Worker instructions explicitly prefer Calendar OAuth and prohibit silently
  substituting a different browser account after an OAuth failure. Both provisioned
  VMs updated. Future provisions use the updated worker source.
- Expired-access-token test verifies server-side refresh and encrypted persistence
  without user/browser interaction. Public Google verification remains pending;
  Google Testing refresh-token expiration still limits unattended longevity.
- This establishes a real background VM read, not a new clock-triggered execution.
  Host Windows PC/network must remain available; the user's client laptop/phone
  need not be online. Do not claim the host itself can run while powered off.
