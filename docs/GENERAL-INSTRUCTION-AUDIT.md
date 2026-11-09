# General instruction audit — November 9, 2026

Read the complete available Main Chat request history: **280 saved entries across 14 pages**, October 18–November 9, 2026; 172 chat entries and 108 scheduled reviews. The chat entries include generated welcome/start/widget messages and one-time maintenance requests, not 172 separate human instructions. Read the saved assistant responses to the chat requests for clarification of corrections and scope. Scheduled outputs are execution evidence, not new user instructions. This inventory is of saved application history, not unrecorded provider conversations or unavailable per-tool traces. Raw transcript, account details and per-entry decisions remain in ignored private account audit data; they are not committed or copied into shared prompts.

The general instruction groups below are all covered by existing rules or this change. Repeated instructions are consolidated, not dropped. The latest explicit correction wins. Runtime shared text is in `worker/general-planner-rules.mjs`, included in the Agent developer assembly for prompted/resumed/scheduled runs and both native and older device Chat context packets. Existing tool, calendar, activation and account-permission enforcement remain in place. Personal facts remain in account settings/memory/history.

| ID | General instruction retained | Where implemented |
|---|---|---|
| G01 | Read canonical notes, memory, relevant history and existing context before asking or planning | Existing guidance + general account-context rule |
| G02 | Explicit initial planning activation; provisional planning after activation instead of waiting forever | Existing activation guards; corrected stale guidance |
| G03 | Every unfinished To-do accounted for over a sustainable extended horizon; blocked prerequisites are not execution | Existing coverage/low-load rules + general allocation rule |
| G04 | Use relevant email, linked documents and authoritative sources; read full requirements | General source-led rule + existing browser/PDF guidance |
| G05 | Distinguish attendance from pitching/presenting, conditional work from published requirements | General source-led rule |
| G06 | Confirmed bookings from all enabled sources belong in Planner, even if absent from Google | General source-led/Google rules |
| G07 | Completion of reply/booking/submission does not complete follow-on work or other components | General source-led/completion rules |
| G08 | Deadline/quiz-date reminders separate from timed attendance, work and preparation | General deadlines rule; later reminder instruction supersedes blanket deletion |
| G09 | Semantic tags distinguish Homework, Studying, To-do, Maintenance, breaks and optional buffers | General deadlines/folder rules + existing event rules |
| G10 | Calm intensity20, one substantial personal non-deadline task/day; coursework priority | Existing low-load + general allocation rules; no personal five-per-day goal |
| G11 | Urgency based on deadline risk and remaining work; overdue unfinished Work urgency99 | Existing urgency + corrected Work rules; due-date-only sorting withdrawn |
| G12 | Batch related subject/project work; generous contiguous blocks, justified splits/spaced practice | Existing low-load + general allocation rules |
| G13 | Meaningful nested/recurring folders; proactive whole-plan visual cleanup | Existing folders + general presentation rule |
| G14 | Folder color follows principal activity; children retain semantic colors | General folder presentation rule |
| G15 | Buffer has optional named fallback; grouped with supported activity, no arbitrary break interruptions | Existing buffer guidance + general free-time rule |
| G16 | Use app-derived plain Free time; avoid tiny filler rows or invented prescribed activities | General free-time + corrected low-load/core guidance |
| G17 | Preserve recurring outer ownership; exceptions/detach for one date, preserve other dates/history | Existing recurrence + general presentation/execution rules |
| G18 | Use effective dates for future-series changes without rewriting past occurrences | General folder presentation rule |
| G19 | Protect sleep, actual routines and fixed commitments; learn personal details privately | Existing personal-context guidance + general causal rules; exact facts excluded |
| G20 | Real route-based travel, early-arrival separate from route/return window; opening hours and access | General location/causal rule |
| G21 | Leave unavailable classroom before rest; no commute between same-location tasks | General location/causal rule |
| G22 | Passive cycles allow compatible work; hands-on chores/trips/collection/folding reserve real time | General passive-waiting rule |
| G23 | Verify usable virtual join link and missing access, not merely online format | General location/causal rule |
| G24 | Work rolling21days with assignments, assessments, overdue/unknown-date exceptions | Existing Work + general Work rule; no duplicate root trackers |
| G25 | Work concise checklist only: urgency, title/subject, deadline(s), remaining/allocated time | Corrected shared Work + general Work rule |
| G26 | Work event-bound rows retire at verified event start, not evidence of attendance/submission | Corrected shared Work + general Work rule; latest start supersedes end |
| G27 | Verified submission completion; keep separate components and personal To-do unfinished without evidence | Existing completion + general completion rules |
| G28 | Clear checked Work after seven days with history; retain checked protected To-do | Corrected shared Work + general Work rule |
| G29 | Track remaining scheduled time separately from actual remaining effort; refresh after reviews/feedback | General completion/Work + existing schedule progress rules |
| G30 | Agreed internal review targets, booking steps and official deadlines are distinct | General deadlines rule; two-day/TA mandate stays personal |
| G31 | Compact grade tracker and accurate weighted denominator/drop/extra-credit calculations | Existing Tutor + expanded grade rule; exact scores/cutoffs excluded |
| G32 | User-requested full-mark assumptions are labelled scenarios, never universal facts | Expanded Tutor + general grade rule |
| G33 | Root Subjects canonical course folders; assessment materials together, misc Resources | Existing Tutor + general library rule; Main maintenance superseded |
| G34 | Original PDFs/materials, all required pages; distinguish source archive/link/text/visual coverage | Existing import/Tutor guidance + general library rule |
| G35 | Main reads Subjects; Tutors maintain them; user moves preserved, assistant files under Agent | Existing live/Tutor policy + general account/library rules |
| G36 | Investigate vague goals/opportunities, distinguish tentative choice, requirements, benefit and cost | Existing goal/Want To Do + general initiative rule; specific opportunities excluded |
| G37 | Browser controls/correct account/saved route before declaring access failure or asking reconnect | Existing sign-in + general browser rule |
| G38 | Sleep-source freshness, actual sleep vs in-bed, timezone and exact/approximate endpoints | Existing WHOOP + general browser rule; personal hourly configuration unchanged |
| G39 | Reconcile supported sleep/wake changes, preserve fixed/past unknown work and one-date scope | Existing staging/WHOOP + general browser rule |
| G40 | Review Google differences, authoritative conflicts, selected writable destination; no duplicate copies | Existing staging + general Google rule |
| G41 | Ignore past sync work normally, preserve real historical cancellations/history | General Google rule + existing staging cancellation decisions |
| G42 | Verify sync completion, not just queue; no duplicate republish to retry export | Existing staging + general Google/execution rules |
| G43 | Execute now rather than acknowledge; continue independent work and checkpoint | Existing run guidance + general execution rule |
| G44 | Atomic coherent schedule draft; widget idempotency and occurrence identity, zero is not done | Existing stage/widget rules + general execution rule |
| G45 | Detailed dated error reports for reads/tools/saves/sync/clashes/omissions; verify current status | General execution rule + existing reporting settings |
| G46 | No blanket clearing, stale reconnect demands or treating scope metadata as API proof | General browser/execution rules + existing health checks |
| G47 | Persistent notifications for user action/sign-outs; personal questions in Main | General execution rule + current app sidebar policy |
| G48 | Read exact IDs/current revisions, preserve manual writing, verify writes; bounded retries | Existing mutation/permissions rules + general execution rule |

## Explicit conflict decisions

- Use the later reminder policy: dates/deadlines can be reminders, with actual work allocated separately. Do not replay the older blanket reminder deletion.
- Use low-load intensity20 and app-derived plain Free time; discard older requirements to prescribe a restorative activity for every minute or manually fill every gap.
- Use the latest Work retirement boundary: verified event start, applied during reviews, not the earlier end-time rule. A checked elapsed Work row is retirement, not proof of study/attendance/submission. Actual To-do/task completion still requires evidence. No exact-time trigger is claimed.
- Work is concise, urgency-sorted with unfinished overdue assignments99. The transient due-date-only sorting request was explicitly withdrawn. Preserve note history when removing checked Work entries after seven days; do not delete completed protected To-do items.
- Main reads Subjects; assigned Tutors maintain the library. Earlier Main-library maintenance and extracted syllabus-note instructions are superseded. Original published PDFs/materials remain preferred; do not manufacture a PDF where none is published.
- One-time maintenance limits and GitHub capability probes are not permanent universal permissions or bans. User actions still require applicable scope/authorization. Private error Notes remain the reporting destination unless an authorized integration is actually configured.

## Deliberately kept personal

Exact sleep/wake/routine times and durations; addresses, library-only/dorm rules, travel modes and particular journey estimates; named contacts, meetings and recurring calls; laundry/shower/hair-care weekdays and intervals; course identities, scores, grading thresholds/drop counts and claimed participation; one-off attendance choices, submissions, task completions and deadlines; named startup choices, budgets and applications; export account identities; WHOOP account-specific retry settings; the two-days-early plus TA meeting mandate. General mechanisms for respecting these preferences are shared. Their literal values are not.

No account instructions, schedule times, existing user notes, grades, task checks or calendar events were rewritten by this audit. New behavior applies on the next run after the worker receives the release; a currently executing/offline worker cannot be silently updated. Native Chat gets the new packet on its next request without an iOS rebuild. Prompt inclusion is verified separately from live agent execution.
