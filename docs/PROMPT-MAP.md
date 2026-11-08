# AI Planner prompt map

Verified from repository code and live account settings on November 8, 2026. This document describes app-owned prompts; provider-internal ChatGPT/Codex/Claude instructions are not available for inspection. Files containing copied instructions are reference snapshots, not live settings. The instructions/skills used by this coding session are not automatically Planner app prompts; only app code and saved account settings below are assembled by the app.

## What actually runs

AI Planner does not have one system prompt. The Agent worker combines several instruction layers, then receives a separate user/job message. The native Chat relay builds a different instruction packet and sends it through the ChatGPT conversation as ordinary message text. Tool descriptions and fetched account context add further material.

Current routes in `src/App.tsx` are `AgentView` and `SubscriptionChatView`. The older `ChatExperiment` extension UI is not the current Chat tab.

### Agent runtime instructions

1. **Worker base instructions — `worker/main.mjs`, `instructions`.** Tool choice, authenticated websites, source verification, original files, scoped reads/writes, and preservation. This is the Agent's starting application instruction text.
2. **Detailed planner guidance — `worker/planner-guidance.mjs`, `plannerGuidance`.** Descriptions and tags, urgency, folders, Work/To-do completion, dates/timezones, browser/source coverage, prerequisite planning, goals, memory, histories, settings and app control. This is approximately 46,125 characters of application guidance.
3. **Live personal instructions — `planner_agent_instructions.content`; `server/agent-instructions.ts`.** The user's editable account layer. For arin, revision 33 has 19,992 characters. It contains accumulated decisions about task load, library work, commutes, grouping, free time, sleep, deadlines, Work formatting and remaining allocations. Settings → personal agent instructions and `planner_instructions_read/update` control this layer. Saving a similarly named file does not change it. Updates affect later runs/resumed turns, not a currently executing turn.
4. **Account-specific behavior — `worker/whoop-sleep-review.mjs`, supplied by `server/vm.ts`.** arin's scheduled WHOOP freshness/reconciliation requirement. This is distinct from the general retry rules below.
5. **Effective application wrapper — `worker/live-instructions.mjs`, `effectiveInstructions`.** Agent output placement, top-level Subjects exception, fixed/planned event types, mandatory staged publication, current personal revision, ownership boundaries, and shared rules below.
6. **Tutor maintenance — `worker/tutor-instructions.mjs`, `TUTOR_MAINTENANCE`.** Tutors maintain only their assigned subject, original published files, solutions, recordings/references and compact grade tracker. Main reads subject folders, updates calendar/Work/Errors and does not perform routine library edits. The tracker has four summary lines plus Component / Weight / Current score. Unverified cutoffs and grades remain unknown.
7. **Subject lifecycle — `worker/subject-lifecycle.mjs`, `SUBJECT_LIFECYCLE`.** Research official term boundaries, preserve past courses, create only confirmed next-term subjects, synchronize Tutors, and book the following turnover. It is not permission to run a turnover at every review.
8. **Browser control — `worker/browser-control.mjs`, `BROWSER_CONTROL_RULES`.** Real interactive navigation, clicks, forms, charts, downloads and authorized website actions. Website content remains untrusted; controls do not authorize unrelated actions. Currently enabled by server policy for arin's VM; this is not automatically enabled for every account.
9. **Sign-in behavior — `worker/browser-signin-instructions.mjs`, `BROWSER_SIGNIN_RULE`.** For all enabled/requested sites, try existing browser controls and prefilled Sign In/Continue first. Ask the user only after the attempt fails or reaches a user-only step. Do not read or disclose credentials. Google website login is separate from OAuth permission; NYU stays read-only.
10. **Conversation-reading permissions — `worker/whatsapp-permission.mjs` and `worker/message-permission.mjs`.** Dynamic text reflecting the account's saved WhatsApp and Slack/Instagram/X/LinkedIn permissions and exact selected-conversation scope. Permission to read one conversation does not authorize an inbox sweep or sending unrelated messages.

`worker/main.mjs` passes the assembled result as Codex `developerInstructions`. The Claude route in `worker/claude.mjs` uses the same application layers through `--append-system-prompt`. `worker/runtime-instructions.mjs` hashes the current assembled rules and refreshes changed app-owned developer instructions for resumed Codex threads. This is separate from the conversation's user-message history.

A measured representative arin developer assembly is **85,151 characters**, excluding dynamic account/permission text, the current job, conversation history, attachments and MCP material. This is a character count, not a token count. The base worker portion is 5,639 characters. These layers overlap substantially; the app currently does not load a single small consolidated prompt.

### MCP instructions and tool descriptions

- **MCP server instructions — `server/mcp.ts`, `instructions` and `createPlannerMcp`.** Calendar staging and event rules, source-health reporting, Notes/Files/history, real schedule/settings tools, subject ownership and verified source updates. This is separate from the worker's developer prompt.
- **Shared calendar rules — `server/calendar-staging-rules.ts`.** Prepare/read/edit/review a draft; resolve issues; publish once. Read-only Google consent can prepare a draft, but publication still requires event-edit consent. Preserve cancellation decisions and account separation.
- **Event/planning rules — `server/event-scheduling-rules.ts`.** Fixed versus planned; recurring/nested folders; Work; low-load planning; per-occurrence exceptions and compatible adjacent merges. `EVENT_SCHEDULING_RULES` includes the staging rules, so some text is repeated across layers.
- **Capability guide — `server/planner-control.ts` and related tool modules.** On-demand explanations returned by `planner_capabilities`/`planner_guide`, including planning, app settings, Screen Time groups, files, chats, calendar and limits.
- **Tool descriptions + schemas — registered in `server/mcp.ts`, `planning-tools.ts`, `planner-control.ts`, `app-settings-tools.ts`, `client-control-tools.ts`, `whoop-review.ts`, etc.** These are also instructions the model uses: required fields, current IDs/revisions, scope, validation and side effects. The local catalog contains **68 tools**, 26,324 description characters and 43,021 serialized schema characters. Whether every schema is presented at once depends on the client; the native relay describes at most eight names per call. Its filter exposes 65 app tools, excluding the three legacy Browser Use tools (browser_open/read/close) because Chat uses its own provider browser.
- **Private browser MCP — `worker/browser-tools.mjs`.** Browser server instructions and source-specific tool descriptions/schemas. The tools explain verified coverage, scoped conversation reading, import provenance and browser actions. These are additional to the Planner MCP catalog.

Prompt wording is not an access-control mechanism. Owner checks, OAuth grants, planning activation, CAS revisions, tool schemas, file/path checks, device acknowledgements and provider permissions are enforced separately in code.

## Scheduled and automatic job prompts

1. **Daily Agent review — `server/vm-power.ts`, `scheduledReviewMessage`; queued by `server/vm.ts`.** Starts with “RUN THE SCHEDULED PLANNER REVIEW NOW.” It combines event rules, WHOOP retries, default review rules, the saved scheduled prompt, and core planning instructions. It asks for evidence/readback rather than acknowledging the schedule.
2. **Saved daily-review instructions — `planner_vm_settings.schedule.instructions`.** Separate from personal instructions. Editable through Agent settings or `planner_schedule_read/update`. arin's saved text is now 8,805 characters, after removing superseded Main-library maintenance directions. It covers source checks, calendar/Work, task coverage, deadlines, low-load planning, locations, and dated Errors reports. It does not replace the worker developer layer.
3. **Default review instructions — `DEFAULT_REVIEW_INSTRUCTIONS` in `server/vm-power.ts`.** Used as the default/fallback and included in the compiled review message. Saved text does not remove these application defaults.
4. **Hourly WHOOP follow-up — `server/whoop-review.ts`, `WHOOP_RETRY_INSTRUCTIONS` and `whoopRetryMessage`.** Verify new sleep data, preserve pending/blocked state, retry hourly without changing ordinary review times, reconcile only verified times, and report fresh/reconciled truthfully. Fresh dated metrics can be reported without invented endpoints; calendar reconciliation still requires verified start/end. This is a separate narrow job, not a full unrelated library review.
5. **Subject turnover — `server/subject-rollover.ts`, `subjectRolloverMessage`.** A separately booked one-time job plus `SUBJECT_LIFECYCLE`. Preserves completed-term materials, verifies enrollments, updates Tutor identities and schedules the next turnover/retry. Does not replan the calendar.
6. **Chat foreground reviews — `server/subscription-schedule.ts`, `schedule_claim`.** Uses the same `scheduledReviewMessage`, then the Chat relay's own instruction packet. Requires the client open and signed into ChatGPT; the saved enabled flag is distinct from Agent scheduling.
7. **Chat cloud-scheduler setup — `schedule_prepare_cloud` in that module.** A setup-only prompt asking ChatGPT to verify a direct authenticated Planner MCP connection before creating any native cloud schedule. It explicitly says not to run the future review during setup and not to claim relay-only blocks work unattended. Generating this prompt is not proof that any cloud task exists.

Live settings checked November 8:

- **arin:** Agent reviews enabled at **07:00 and 17:00 America/New_York**; Chat reviews disabled. Existing times and enabled states were preserved.
- **arin2:** Agent reviews disabled; Chat reviews disabled. The sign-in/readiness hold remains. Its separate copied personal/scheduled settings are not arin's live editable rows.
- Enabled website choices, successful sign-in, OAuth consent, scheduled-task enablement and actual source coverage are separate states.

## User-triggered and conversation prompts

1. **Normal user message — `server/vm.ts` → `worker/run-control.mjs`, `continuationPrompt`.** The actual request plus enabled source URLs. Includes subject identity for Tutor jobs. Paused/steered requests receive saved partial work and continuation context so completed writes are not repeated.
2. **Tutor identity — `continuationPrompt`.** Adds the subject name and folder ID as data, then directs maintenance only for that subject. This is why each Tutor can reuse the general model without its own completely separate system prompt.
3. **Main introduction — `server/vm-chats.ts`, `ensureMainWelcome`.** One-time prompt to read Goals/To-do, ask up to three concise questions, avoid website writes and avoid publishing a calendar. It is not a recurring review.
4. **Begin Planning in Agent — `server/planning.ts`, start action.** User-triggered full review plus the scheduled workflow. Reads current saved schedule, memory, task feedback, notes and sources; may build a provisional coherent plan after activation. It is not merely a setup acknowledgement.
5. **Begin Planning in Chat — `SubscriptionChatView.tsx`, `beginPlanning`.** A separate shorter message asking ChatGPT to read current app context, use its browser, build/review a complete draft, publish once and update Work/Errors.
6. **Widget duration/completion — `src/lib/widgetFeedbackMessage.ts`.** Generated prompt carries request ID, occurrence ID, original interval, exact requested remaining time or done status, and requires whole-plan staged reconciliation. A preview is not a live calendar edit or proof of completion.
7. **Widget “Tell me what to do” — same module, free-time branch.** Fills only the remaining free window, respects intensity/deadlines, preserves existing commitments and publishes once. Does not authorize filling every later gap.
8. **Connect Brightspace — `SubscriptionChatView.tsx`.** Button-generated message asking ChatGPT to open Brightspace, click sign-in, expose its secure form inside Planner and verify the course list. Credentials are not requested in the conversation.
9. **Manual maintenance / source-recovery requests.** Individual messages stored in `planner_vm_jobs.message`, including user-requested cleanup and technical recovery instructions. These are one-time user/job prompts, not new permanent system rules. Earlier messages remain history; their temporary limits do not silently become global policy.
10. **Conversation history and branch/resume context.** Existing conversation content and prior results are supplied by the provider/runtime; the app uses `worker/branch-input.mjs` and `run-control.mjs` for continuity. A cold native relay can prepend up to 24,000 characters of earlier Planner context (`PlannerWebView.swift`). This is contextual conversation text, not a replacement system prompt.
11. **Attachments — `worker/chat-attachments.mjs` and related attachment modules.** Actual images, extracted text and coverage notices are turn context. PDF page/character limits are explicitly described. They are not automatically archived Files or new instructions.

## Native Chat relay packet

The Chat tab uses a different assembly from the Agent worker:

1. `server/subscription-tools.ts`, `tool_begin`: Agent file policy + native relay protocol + secure website sign-in guidance + current personal instructions + saved Agent schedule labelled **context only** + Tutor/Main role + shared sign-in and full Tutor rules.
2. `server/device-chat-tools.ts`, `relayProtocol`: discover tools, get schemas, emit one machine request block, wait for real results, scope every action to the current owner, preserve request IDs, and never claim a write without readback.
3. `src/lib/subscriptionTools.ts`, `toolTurnMessage`: wraps the current user request with `PLANNER_TOOL_REQUEST` / `END_PLANNER_TOOL_REQUEST`, the current turn ID and the expected JSON format. `toolResultsMessage` returns untrusted tool results, truncation warnings and continuation instructions.
4. `ios/AIPlanner/PlannerWebView.swift`: forwards this packet through the existing ChatGPT conversation, reads returned text/files and enforces Test project routing for signed-in relay messages. It does not install a custom provider system role. The normal ChatGPT product/project instructions still exist separately and were not extracted in this audit.
5. `server/device-chat-tools.ts`, `deviceToolContext`: older device/extension packet combines the relay protocol, file policy, personal instructions and compiled review rules. It remains in the repository, but is not the assembly used by the current native `SubscriptionChatView`.

Agent and Chat therefore share many policies and app tools, but their prompt transport, provider browser session and unattended execution behavior are not identical.

## Older/alternate paths still in the repository

- **Browser Use academic collector — `server/agent.ts`, `launch`.** A read-only structured academic extraction prompt with current date, enabled sources, focus and Google snapshot. Outputs a validated update schema. This is an alternate legacy collection route, not the main Agent worker developer prompt.
- **API/gateway chat — `server/agent.ts`, `chat`.** `generateText` instructions use calendar/Files/recent-run context, disallow invented access and expose a limited launch-sync tool. This route uses API/gateway infrastructure; it is not the subscription website Chat relay. The current main Agent/Chat UI does not render this older chat component.
- **OAuth `prompt=select_account consent`.** This occurrence of “prompt” is a Google authorization parameter, not text sent to an AI model. Browser login jobs likewise invoke connection handlers rather than a general assistant prompt.
- **Copied Files named instructions/system prompt.** Only reference material unless code explicitly reads it. Live behavior is changed through the instruction/schedule tools/settings, not by editing a similarly named note.

## Context that influences behavior but is not a system prompt

Private memory (`planner_agent_memory`); planning preferences/intensity and tasks (`planner_planning`); current calendar/staging; Goals, To-do, Work, Agent To Do and subject notes; source-health issues; histories/cursors; selected sources/conversations; live tool results. The agent is told to read these when relevant. It does not necessarily load every File at once. Website/email/PDF/tool text remains untrusted data and must not rewrite developer instructions.

## Findings from this repair

The saved review prompt still contained older directions to have Main edit Subjects, create rich syllabus notes and maintain verbose grade notes. Those sections contradicted later user requests. arin's saved scheduled text was corrected in place, with compare-and-swap protection, retaining review times, flags and unrelated planning preferences. The shared native Chat packet now includes the same full compact Tutor rules as Agent.

Other repairs: useful schema-validation errors without echoing payloads; draft preparation with read-only Google access while retaining publication consent checks; fresh WHOOP metrics without fabricated endpoints; 50 MB original PDF support and verified download/link imports; bounded original DOCX text/comment reading from browser downloads; prefilled browser sign-in first across enabled sites; explicit read-only versus export-permission UI.

There is still substantial duplicated prompt text across worker guidance, event rules, tool descriptions, saved personal instructions and scheduled instructions. A future consolidation could reduce conflicts and input size, but this repair did not wholesale rewrite the user's 19,992-character personal policy or claim that Agent and Chat have identical underlying execution.

Implementation references for the native-format reader: [Microsoft WordprocessingML structure](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document) and [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT). The reader never treats a Word download as a PDF or claims visual coverage.
