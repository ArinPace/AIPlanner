# AI Planner

A React + TypeScript planner with Calendar and Files workspaces, deployed on Vercel with private Supabase storage.

Live app: https://aiplanner-ten.vercel.app/

## Hosted storage

The hosted API saves accounts, sessions, calendars, folder trees, text files, links, and PDF metadata in Supabase PostgreSQL. PDF bytes go directly to the private `planner-pdfs` Storage bucket using temporary signed URLs. Downloads require an account session and use short-lived signed URLs. PDFs can be up to 25 MB; uploads bypass the Vercel function body limit.

The schema is in `supabase/migrations/`. Database tables have row level security enabled and deny browser roles direct access. The server uses `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`); keep these in Vercel environment variables, never in frontend variables or source control. Account passwords and session tokens are stored as hashes. Each API request is scoped to its account. Concurrent Files saves reject stale revisions instead of overwriting newer changes.

Pushes to GitHub's `main` branch automatically deploy to Vercel. `/api/health` verifies database access and the private PDF bucket. The existing local account was migrated without changing its password hash.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by Vite, then sign in or create an account. Accounts and data are saved on this computer in the project's `data/` directory. The Vite development and preview servers both include the local API; opening `dist/index.html` directly does not provide persistence.

## Files

Choose **Files** in the header, then create a folder. Folders support names, custom colors, comma-separated labels, and nesting. Open a folder to:

- Create and edit plain text files; click **Save text file** to persist edits.
- Upload PDF documents up to **25 MB** and download the original PDF later.
- Save web links with a title and open them in a new tab.
- Rename and move items using their editor's folder selector.

Use **Edit folder** to change a folder's name, color, labels, or parent. Folder moves cannot create cycles. Search scans names, labels, folder paths, text contents, and saved URLs across the entire folder tree; PDF contents are not indexed. Filter by folder label and sort by name or recent updates. Deleting a folder removes its subfolders and all their items after confirmation. Text edits stay open when switching workspace tabs; leaving the editor, closing the page, or logging out prompts when there are unsaved edits.

## Local development storage

- `data/users.json` and `data/sessions.json`: existing account/session storage.
- `data/calendars/<username>.json`: calendar events and settings.
- `data/files/<username>.json`: folder tree, text files, saved links, and PDF metadata.
- `data/uploads/<username>/<document-id>.pdf`: uploaded PDF bytes.

Files endpoints require the existing signed-in session. Uploading, downloading, moving, or deleting items affects only that account. Keep the `data/` directory when moving or backing up the app. Calendar and Files are saved independently.

## Agent and ChatGPT MCP

The hosted **Agent** tab provides in-planner conversations with a collapsible vertical chat sidebar. Saved external ChatGPT conversation links remain available under Settings → Advanced; these links open the real ChatGPT conversation, and removing a link does not delete it.

The authenticated MCP endpoint is `https://aiplanner-ten.vercel.app/api/mcp`. In ChatGPT Plugins, choose **Add custom MCP server**, name it AI Planner, enter that endpoint, select OAuth, and authorize with your planner account. The Agent page includes the URL, a starter check-and-schedule prompt, connection status, and a disconnect button. Authorization is separate from ChatGPT plan billing. The connector uses the official MCP SDK with stateless Streamable HTTP and JSON responses; OAuth discovery is published under `/.well-known/`.

OAuth uses dynamic public-client registration, exact registered OpenAI/loopback callbacks, S256 PKCE, one-use browser-bound consent requests and authorization codes, resource binding, scoped opaque access tokens, atomic refresh-token rotation and revocation. Only token hashes are stored. MCP tables have RLS enabled and deny direct browser-role access. Every tool is scoped to the authenticated planner account; write and browser tools require their corresponding grant.

Tools read calendar and Files, organize nested folders and notes, save links and events, register chat URLs, inspect run history, and atomically save verified source updates. Calendar and Files changes use revision checks. Source imports deduplicate generated records and preserve manual edits. PDF uploads continue to use the existing private upload flow.

`planner_calendar_read` searches the internal planner calendar (including hidden
events and recurrence rules), independently of Google Calendar. Results are
paginated base events, not expanded recurring occurrences. `planner_save_event`
creates events or patches only supplied fields on an existing ID; omitted tags,
recurrence, descriptions and source metadata remain intact. Series edits affect
the entire series. Unknown IDs, invalid tags and stale revisions are rejected.

`planner_files_search` searches all nested folders, paths, labels, note contents,
link URLs and PDF filenames, with optional subtree filtering and pagination.
`planner_read_file` returns paginated note text, link metadata, or extracted text
from uploaded PDF pages. PDFs require both owned Files metadata and a completed
owned upload, use private storage directly, and never expose storage credentials
or signed URLs to the model. PDF text extraction does not provide OCR or diagrams;
empty/scanned pages and unread pages must be reported accurately. A search does
not search inside PDFs; read the relevant PDF pages separately.
`planner_update_item` renames/moves notes, links and PDFs, edits notes/link URLs,
and changes folder parents, colors and labels. It preserves PDF bytes, validates
folder hierarchy, and rejects unsupported field edits and concurrent saves.

`browser_open`, `browser_read` and `browser_close` resume the saved Browser Use profile. The server connects directly to its owned cloud browser via CDP, without launching a separate AI inference run. Browser sessions have recordings disabled, a 12-minute window, a 15-minute provider timeout, and a scheduler cleanup. Only explicitly enabled source domains can be navigated; browser cookies, local storage and arbitrary JavaScript are never exposed through tools. Page text and links are untrusted data. Users must complete login/MFA in the returned live view when sessions expire. Browser Use still bills browser sessions. ChatGPT can instead use its own separately authenticated cloud browser.

The existing Browser Use AI collector and Supabase 7 AM / 5 PM America/New_York scheduler remain available through the hosted API. Once a ChatGPT scheduled workflow is verified, disable the separate Browser Use schedule to avoid duplicate runs. A scheduled ChatGPT task must retain the connected plugin and applicable browser permissions; do not treat a prompt asking for a schedule as proof the schedule exists. Local computer access is not needed for cloud checks.

Optional Google API and hosted OpenAI identity OAuth endpoints remain available when registered application clients are provisioned. They are separate from connecting this MCP to ChatGPT. Agent operations use the hosted Supabase API; local development continues to use its disk API.

## Validation

```sh
npm run build
npm run lint
npx tsx@4.21.0 --test server/agent.test.ts server/mcp.test.ts
```
# Private Windows VM agent

The Agent page opens directly to chat for connected accounts. Use Add sites to
connect more websites; Connect selects the source and opens a sign-in tab while
the VM starts. One-time AI setup disappears after completion. Settings contains
the daily schedule editor; AI account management, activity, private-computer
controls, and saved ChatGPT links live under Advanced. The conversation sidebar
stays vertical at every screen size and can be hidden.

Each account pairs one outbound-only Ubuntu VM. The worker polls HTTPS; the
Windows host, CDP, VNC, and Codex app-server do not require public inbound ports.
Supabase stores chat jobs and account-owned connection state with RLS enabled
and access limited to the backend service role. Pairing codes expire after 15
minutes and are single-use. Only hashes of worker bearer tokens are stored.
Jobs use atomic claims and renewable leases; expired jobs fail instead of
silently replaying planner writes. Revocation cancels queued/running work.

## Host setup (operator, once per account)

New planner registrations now enqueue a distinct private VM automatically.
`host/main.mjs` runs on the Windows host and provisions queued accounts through
Multipass. The provisioner has a separate revocable token; no Supabase service
key or users' passwords are installed on Windows. Its default capacity is four
VMs (4 GB each); later registrations wait rather than overcommitting this PC.
VMs retain their own browser profile, ChatGPT registration, thread history and
daily tasks while the user's phone/laptop is offline. The Windows coordinator
wakes each VM at sign-in and shortly before its scheduled slot. Real interaction
renews a 30-minute idle timeout; background page polling does not. Running jobs
finish before shutdown. The Agent header shows the reported VM power state.
The Windows host must stay on.

After registering the host through the operator-only
`POST /api/agent/vm/host/register` endpoint, store its returned token and planner
origin in a private JSON file outside the repository. Install the startup task:

```powershell
.\scripts\install-vm-host.ps1 -ConfigPath <private-host-config.json>
```

The following manual provisioning command is an operator recovery path, not
part of normal end-user setup.

Use Windows 11 Pro with firmware virtualization. Enable Hyper-V without an
automatic reboot, install Canonical Multipass 1.16.4, and restart Windows if
requested. No Windows or browser profile is mounted into the guest.

Create a pairing code under Agent → Settings → Advanced → Private computer, then run from
this repository in PowerShell:

```powershell
.\scripts\provision-vm.ps1 -Username arin -PairingCode <one-time-code>
```

The script creates `planner-arin` with 2 vCPUs, 4 GB RAM and a 25 GB disk. Repeat
with a different planner username and its own pairing code for another account.
It installs a non-root worker, persistent Chromium profile, virtual display,
loopback-only browser view, and restartable systemd services. VM dependencies
are pinned by `worker/package-lock.json`. The coordinator starts with Windows;
guests start only when needed. Keep the host awake and online for scheduled checks.

Enrollment codes enter the Windows coordinator over stdin and are transferred
over Multipass SSH into private temporary directories. The guest consumes and
deletes its one-use code before enrollment. Codes are never passed in command
arguments or committed. Host lifecycle diagnostics are written beside the private
host configuration in `host.log`, with no tokens, browser URLs, or command output.

The user can verify and save an OpenAI API key in Setup. The backend encrypts it
using `CONNECTION_ENCRYPTION_KEY`; only the bound VM receives it. Never log it.
Remove it from Setup to stop future API-key use. A separately connected ChatGPT
account is independent and must be removed from its VM separately.

## Personal ChatGPT authorization

For the explicitly configured personal account (`PLANNER_PERSONAL_CHATGPT_USERS`,
default `arin`), Setup → Use a ChatGPT subscription → Continue with ChatGPT shows
a one-use device code and OpenAI authorization link. Complete authorization in
the user's ordinary browser on their phone or computer. Their private Codex
runtime on the VM owns login and refresh; no login inside automated Chromium or
local helper on the phone is needed. This is remote control of the owner's
personal local agent, not a subscription-login integration for hosted customers.
Do not expand the allowlist as a substitute for an approved hosted integration.
Choosing ChatGPT removes a previous API key; Disconnect ChatGPT logs the VM's
own Codex account out. It never imports an existing desktop Codex credential.

The separate SIWC loopback implementation remains an operator recovery option;
it is not the default website flow. OpenAI's remote-VM SIWC guidance describes
completing OAuth locally and transferring that registration over SSH.

An optional operator-side command is also available from this repository on
the Windows computer running the browser:

```powershell
node scripts/connect-chatgpt.mjs --vm planner-arin
```

This implements OpenAI's documented SIWC open-source registration with its own
client registration, stable VM host ID, PKCE, state, nonce and ID-token
verification. The user approves on OpenAI's page. Credentials are transferred
directly into the selected VM over Multipass's protected channel and saved
owner-only; the VM owns refresh-token rotation. No existing Codex auth file is
copied. Identity-only sign-in is not mistaken for plan-use permission.

Public/hosted subscription access needs an approved OpenAI integration. The
website does **not** expose native Codex OAuth as a workaround. The UI explains
that general hosted ChatGPT sign-in is not enabled; API-key setup is available instead.
See https://developers.openai.com/siwc/token-sharing-open-source and
https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms.

## Website sign-in and daily checks

Select websites, then open their private sign-in view. A temporary Cloudflare
Tunnel transports the view over HTTPS; a random 192-bit path is required for
every static asset and WebSocket request. The view expires after 20 minutes and
closes automatically after a connection is confirmed, or when Verify connections runs. Do not share its URL. Browser cookies stay
on that account's VM disk. No video, trace, or session recording is enabled.
Verify connections checks for authenticated-page evidence, not merely a 200
response. SSO/MFA can still expire or block automated Chromium; reconnect when
needed. Startup shows an estimated percentage below 100 until the viewer is
ready. The worker detects signed-in pages, saves a confirmation timestamp, and
the planner closes the connection tab. Connected websites have an Open site
button that keeps the saved browser session open. Gradescope starts from
Brightspace so the user can launch their course's Gradescope link; the VM
remembers only the Brightspace course page, not expiring SSO launch tokens.
Agent jobs pause while the interactive sign-in view is open.
Automatic package updates install normally but defer restarting the five
interactive desktop services until the next normal VM restart. Worker restarts
invalidate old viewer links; the planner explains the interruption and offers
Reopen browser without clearing the saved profile.

The agent's browser MCP exposes read-only navigation and page reading only;
it does not expose clicking, form submission, JavaScript execution or cookies.
Chats have per-chat Archive/Restore and Delete actions, an Archived chats view,
and copy buttons for user and assistant messages. Archived chats stay readable
and must be restored before sending. Delete removes the chat and its planner
job history; account ownership is checked server-side.

Slack channel reads wait for rendered messages, reuse matching open tabs, and
scroll to the latest end of the virtualized list. Results include message
timestamps, permalinks and image indices. `browser_view_image` returns real
image pixels to the agent for visual reading. Normal `browser_read` calls attach
the latest four content images automatically, within an 8 MB budget, so users
do not need image-specific prompts. Additional image indices are reported for
follow-up reading. Slack uses the original signed-in
attachment where available, with a rendered-image fallback. Only Slack file
hosts/paths are permitted for attachment requests; redirects and image formats
are checked. Image text is untrusted data, and unreadable or absent details
must be reported honestly. A loading shell is reported as incomplete access.
Planner tools are bound to the worker's username and current job lease. The
agent reads calendar/files and saves sourced updates through the existing MCP.
When enabled, daily checks enqueue once per configured time and timezone while
the worker is online. The default is 7 AM / 5 PM America/New_York; Settings allows
one to six daily times and an IANA timezone. The host wakes the VM two minutes
before a slot. Enabling this schedule disables the older Browser Use
schedule to avoid duplicate collectors. Offline slots are not backfilled.

## Validation

### Recycle Bins and website browser routing

Files supports selection across folders, notes, links and PDFs. Deletion moves
the selected items and folder descendants into a private 30-day Bin. A bulk
deletion is shown as one group and restores together. Restores preserve content
and folder metadata, rename name conflicts, and use a recovery folder when the
original parent no longer exists. Existing PUT-based deletions also go to Bin.
PDF objects remain private and intact until final deletion. File Bin changes and
Files revisions commit in one service-only database transaction.

Chat deletion, including bulk deletion, retains the chat and messages for 30
days, cancels pending/running work, and hides the chat until restored. Restoring
retains archive status. Both Bins offer explicit permanent deletion with a UI
confirmation. Chat Bin expiry cascades through planner job/message records.
The `ai-planner-bin-retention` database cron purges expired records every five
minutes; the existing minute-based authenticated agent tick removes PDF objects
marked for deletion through the Storage API and retries failures. Cleanup does
not require an open client or running per-user VM. These Bins use hosted storage.

All new website connections now use installed regular Chrome with default
security settings. Browser sources share one registry; future entries inherit
the same setup, verification and agent page/image routing. Old browser sessions
are retained without copying cookies and migrate source-by-source on explicit
reconnect, or when opening an expired session. Google and X always use regular
Chrome. Identity-provider policies and MFA can still require user action.

```powershell
npm run build
npx tsx --test server/agent.test.ts server/mcp.test.ts server/vm.test.ts
node --test worker/browser-access.test.mjs
```

After provisioning, verify the entire path: Setup AI → private browser login →
Verify connections → chat → completed run → planner change. A successful web
build or queue test alone does not establish a working VM or model turn.
### Fixed and agent-planned events

Every event has a `scheduleType` secondary classification (`fixed` or `planned`), independent of tags and planning locks. The sidebar filters both groups across all views without changing the stored events or Google export. Filter choices persist per account in the browser. The event editor and `planner_save_event` can change this classification.

Fixed events automatically export to the selected OAuth Google primary calendar through the existing authenticated minute scheduler, without a VM or agent run. A durable queue, per-account event mappings, stable Google IDs and etag checks reconcile retries. Exact existing Google appointments are adopted rather than duplicated. Planned tasks, study sessions, routines, sleep, breaks and buffers are excluded. Only app-created mirrors can be automatically removed; original Google appointments remain when their local copies are removed or reclassified. This is a Planner-to-Google export, not an import of arbitrary external Google edits. Status and a manual sync action appear above Tags. OAuth event-edit permission is required.

`scripts/connect-chrome.ps1` reuses the persistent browser-harness daemon, or starts one connection attempt. The Windows task **AI Planner Chrome Debug Connection** runs this script at user sign-in. It does not bypass Chrome approval or repeatedly retry permission prompts; Chrome restart or a revoked grant can require approval again.
### Event folders

Choose **Folder** in the event editor, then **Add event** to enter each child event in its own popup. Saving a child returns to the folder editor so another can be added. The folder range follows its children. Week and Day show one collapsed block; clicking expands it, and the current-time line automatically expands an active folder. Use the separate Edit button to change its contents. Month/Year show the folder as a single event. Removing a child from the folder keeps it on the calendar; deleting the folder ungroups its children.

Children stay real events with stable IDs, task links, independent tags/classification and history. Fixed children export to Google individually; the visual container does not export or add counted work time. Converting an existing event creates a new container and keeps the original event inside with its ID unchanged. Folders may contain other folders using Add folder. Ancestor time ranges update recursively, and current nested folders expand together with their ancestors. Circular nesting is rejected. Folders and their children must be timed and dated. The outer folder can repeat daily, weekly, monthly or yearly, with an interval and optional end date; nested folders and events inherit its schedule and relative local times. Editing a recurring folder or child edits the series. Tools use `eventKind: "folder"` on a fresh container and `folderId` on its existing/new child events.

Recurring events support exact skipped occurrences via excludedStarts. Use planner_delete_events with scope occurrence and occurrenceStart to skip one instance, or scope series for the whole series. The editor provides separate Delete this occurrence and Delete series actions. Folder exclusions propagate to descendants and fixed Google exports use EXDATE. Adjacent matching title/tag blocks merge automatically when task identity, parent and recurrence/exception rules are compatible; descriptions, source IDs and history are retained.

Removing one recurring folder occurrence skips every nested event for that occurrence only. Deleting a recurring folder series removes its entire nested subtree for all dates; non-recurring folder deletion still ungroups its contents. Non-break descendants remain protected by the agent removal-permission check.
