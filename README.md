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
