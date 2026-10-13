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

## Checks

```sh
npm run build
npm run lint
```
