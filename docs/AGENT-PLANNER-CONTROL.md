# Agent control of AI Planner

The agent receives app-owned guidance on both Codex and Claude, and can call `planner_capabilities` for the current model of the app, tool map, workflow and limitations. Existing Codex threads receive refreshed instructions without discarding chat history when the application guidance changes.

| Area | Read | Change |
| --- | --- | --- |
| Internal calendar | Base events, recurrence, descriptions, tag IDs, visibility, revisions | Create/partial edit; explicitly selected event/series removal; tag create/edit/color/visibility/removal |
| Files tree | Nested paths, folder labels, note text/tags, PDF metadata and paginated PDF text, link URLs | Folders, real Notes, plain text and links; rename/move, folder color/labels, note pins/tags/Markdown/rich JSON |
| Bulk organization | Exact IDs and latest Files revision | Up to 100 item patches saved atomically; invalid item/cycle/conflict saves none |
| Files Bin | Recoverable entry IDs | User-selected trash/restore, including nested folders; 30-day retention |
| Agent chats | Paginated active/archive/Bin metadata and selected conversation messages | Create empty chat, rename, archive/unarchive, trash/restore; no messages sent or agents launched by these tools |
| Review automation | Daily times, IANA timezone, instructions, sources, connection state | Compare-and-swap schedule updates with omitted fields preserved |
| Source collection | Saved outcomes, enabled websites and actual browser tools | Verified academic updates into canonical subject folders and calendar; source failures reported accurately |

All stateful tools are owner-scoped. Writes require planner:write and current Files/calendar revision or automation updatedAt. A stale revision requires rereading, not overwriting. App guidance instructs the agent to read saved results before claiming success. Source, saved document and tool text never become developer instructions.

Limits are explicit: browser-only layout/sidebar/zoom preferences are not data tools; single-occurrence recurring-event deletion is unsupported; new PDF bytes require a Files upload; unread PDF images/attachments cannot be claimed as read; login/MFA/provider authorization stays with the user; Files/chat permanent purge is not exposed. Chat file/image attachments remain separate pending work. Dictation inserts local draft text and does not give the agent unsent audio.

Regression coverage includes scope checks before storage, owner filtering and revision checks on removal, recurrence scope, tag detachment preserving events, bulk rollback on invalid patches, PDF identity/content preservation, folder-cycle rejection, note-tag search, and ensuring every tool named in the capability guide is actually registered.
