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
