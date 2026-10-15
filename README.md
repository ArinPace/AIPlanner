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

The hosted **Agent** tab is a list of private ChatGPT conversation links. Add a name and the conversation URL; links persist per planner account in Supabase and open the real ChatGPT conversation in a new tab. Removing a link does not delete the conversation. ChatGPT transcripts are not copied or embedded. The previous gateway chat data remains in storage.

The authenticated MCP endpoint is `https://aiplanner-ten.vercel.app/api/mcp`. In ChatGPT Plugins, choose **Add custom MCP server**, name it AI Planner, enter that endpoint, select OAuth, and authorize with your planner account. The Agent page includes the URL, a starter check-and-schedule prompt, connection status, and a disconnect button. Authorization is separate from ChatGPT plan billing. The connector uses the official MCP SDK with stateless Streamable HTTP and JSON responses; OAuth discovery is published under `/.well-known/`.

OAuth uses dynamic public-client registration, exact registered OpenAI/loopback callbacks, S256 PKCE, one-use browser-bound consent requests and authorization codes, resource binding, scoped opaque access tokens, atomic refresh-token rotation and revocation. Only token hashes are stored. MCP tables have RLS enabled and deny direct browser-role access. Every tool is scoped to the authenticated planner account; write and browser tools require their corresponding grant.

Tools read calendar and Files, organize nested folders and notes, save links and events, register chat URLs, inspect run history, and atomically save verified source updates. Calendar and Files changes use revision checks. Source imports deduplicate generated records and preserve manual edits. PDF bytes continue to use the existing private upload/download flow, not MCP text payloads.

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

The Agent page now supports in-planner chats and a three-step setup: connect AI,
choose websites, and verify private-browser sign-ins. Existing ChatGPT links and
the planner MCP connection remain under a separate expandable section.

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
wakes each VM shortly before its scheduled slot and stops idle guests. The host
must stay on.

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

Create a pairing code under Agent → Private computer settings, then run from
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
default `arin`), Setup → Use a ChatGPT subscription → Continue with ChatGPT opens
OpenAI in the VM browser. Its loopback callback runs inside that same VM. The
phone or device displaying the browser does not need a local helper. This path
is restricted to the personal self-hosted installation, not general hosted users.
Choosing ChatGPT removes a previous API key; Disconnect ChatGPT removes the
saved VM credentials.

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
closes when Verify connections runs. Do not share its URL. Browser cookies stay
on that account's VM disk. No video, trace, or session recording is enabled.
Verify connections checks for authenticated-page evidence, not merely a 200
response. SSO/MFA can still expire or block automated Chromium; reconnect when
needed. Agent jobs pause while the interactive sign-in view is open.

The agent's browser MCP exposes read-only navigation and page reading only;
it does not expose clicking, form submission, JavaScript execution or cookies.
Planner tools are bound to the worker's username and current job lease. The
agent reads calendar/files and saves sourced updates through the existing MCP.
When enabled, daily checks enqueue once per 7 AM / 5 PM New York slot while the
worker is online. Enabling this schedule disables the older Browser Use
schedule to avoid duplicate collectors. Offline slots are not backfilled.

## Validation

```powershell
npm run build
npx tsx --test server/agent.test.ts server/mcp.test.ts server/vm.test.ts
node --test worker/browser-access.test.mjs
```

After provisioning, verify the entire path: Setup AI → private browser login →
Verify connections → chat → completed run → planner change. A successful web
build or queue test alone does not establish a working VM or model turn.
