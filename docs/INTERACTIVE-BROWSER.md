# Interactive source browser

The account `arin` has explicitly requested full website control. Worker config
sets `browserControlEnabled` only for this account; other accounts retain the
existing reader. No profile, pairing, token, or dependency changes are required.
The idle outbound updater delivers the release between jobs.

The browser MCP adds real, persistent browser tabs and these tools:

- `browser_navigate`: enabled website or an actual observed external link; reuse a tab.
- `browser_tabs`: discover existing enabled-site tabs and popup tabs.
- `browser_snapshot`: visible page text and interactive refs, including iframe content;
  paginate with `offset` and `elementOffset`.
- `browser_screenshot`: viewport/full page pixels, including SVG/canvas and tooltips.
  For inner-scrolling app panels, full-page capture returns ordered viewport tiles
  with actual scroll positions, a coverage/truncation flag, and restores the original scroll.
- `browser_action`: clicks (including double/right click), hover, fill, keypress,
  select, check/uncheck, scroll, drag, back/forward/reload, wait, upload and close.

Actions can submit forms, send requested messages, and change website settings.
The effective runtime rules supersede older blanket read-only/never-send wording.
This enables the capability; it does not direct the agent to make unrelated edits
or send unsolicited messages. Linked Planner/Google events still use staging.
Passwords are masked in screenshots and omitted from form values in snapshots.
There is no raw JavaScript, cookie, credential, local-browser-file or host-shell API.
Uploads accept real paths inside the existing agent workspace, checking symlinks.
Clicked downloads return an actual saved workspace path, not fabricated contents.

Refs are invalid after the next snapshot/action on that tab. Action responses
include fresh refs, dialogs, downloads and new tabs. A failed action can have an
uncertain outcome; inspect before retrying sends. JavaScript dialogs dismiss by
default; `accept:true` accepts the dialog triggered by that action. External
navigation starts at an enabled source and follows observed links; direct local
addresses, file URLs and embedded-credential URLs are rejected.

`browser_import_pdf` now accepts canonical non-UUID folder IDs as well as UUIDs.
For this account, Codex MCP approval configuration explicitly allows the browser
control tools and PDF import during scheduled `approvalPolicy:never` runs.
Authorized Google account discovery/read tools are no longer accidentally hidden.

Verification: `node --test worker/browser-control.test.mjs` exercises the registered
MCP tools against real Chromium with intercepted fixture websites: click Sleep,
read labelled historical times, hover a chart, capture PNGs, iframe interaction,
fill/send a fixture message, change day, upload/download CSV, accept a dialog,
follow a popup link, and reuse tabs across calls. This is an integration test of
the actual browser tools. The strengthened test uses a fresh CDP connection per call,
matching production (target identity and refs survive disconnection).

Live worker 0.3.1 verification: actual WHOOP screenshots, Sleep detail clicks by
ref, next/previous date clicks by fresh refs, and same-tab reuse passed. October21
shows 8h01m in bed / 7h16m asleep / 45m awake; November3 shows 7h38m / 7h05m / 33m.
Explicit bedtime/wake labels and timezone remain unverified; do not infer them
from axis ticks. The current unsynced day is not a proven WHOOP/login defect.
The 0.3.2 live WHOOP recheck also passed in sync mode (approval policy never):
2 real image tiles at scroll offsets [0,97], full chart-bottom coverage,
truncated:false, and restored scroll position 0. The PDF negative probe reached
source HTTP403 without an approval/schema rejection; it did not save a PDF or
verify successful original-file access. All three QA jobs completed. The dated
Errors report contains the results; the separate QA chat is archived.

Files reliability follow-up: production note-save failures logged PostgreSQL
57014. Existing REST saves resent a 4.7 MB state for one note. The service-only
planner_save_file_item RPC and server callers now transfer only the validated
note, enforcing owner/revision and retaining existing protection/history triggers.
Rollback-only production DB QA verified unrelated-state preservation, history,
stale revisions, creation, protected notes and denied anonymous/authenticated
function access. Measured one-note write: 776 ms. This is evidence for the narrow
path, not proof that every intermittent storage failure has the same root cause.
Actual Planner PATCH saves/readbacks of the dated Errors report then succeeded at
Files revisions 1475,1476,1477 after the full-state path had failed twice.
