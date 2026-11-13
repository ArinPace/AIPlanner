# Direct ChatGPT web control through Planner MCP

Priority: validate the remote MCP at `https://aiplanner-ten.vercel.app/api/mcp` directly from ChatGPT web. Native relay embedding and subject-population runs are separate work, not prerequisites. The MCP shares the account-scoped backend tool registry with the Agent and retains revision checks, histories, planning gates and device acknowledgements.

## Current coverage and acceptance gates

| Area | Tools / behavior | Verification required |
| --- | --- | --- |
| Discovery and account connection | Stateless Streamable HTTP; anonymous catalog, OAuth/PKCE for account tools, scoped access and refresh tokens | Initialize/list without account data; denied anonymous writes; ChatGPT account-link and authorized call |
| Calendar | Events, recurring occurrences, nested folders, tags, history/restore, multi-draft staging and publish | Disposable event create/edit/read/remove; recurrence and revision conflicts; no live coursework edits |
| Work / To-do | Canonical notes, task/planning tools, checklist linking, individual activity completion | Required linked blocks gate parent completion; recurring maintenance stays pending; folders cannot use direct Done |
| Files | Nested folders/Notes/text/links, metadata search, atomic edits, Bin/restore, PDF text | Exact content/IDs survive edits, moves, restore and concurrent revision rejection |
| Binary files | `planner_file_upload_start`, `planner_file_upload_finish`, `planner_file_download`; existing PDF-specific 50 MB flow | Original bytes; account ownership; 25 MB general file cap; stale revision retries; idempotent finish; safe attachment replacement |
| Settings | Duration scaling and notification preferences; private instructions/memory | Compare-and-swap, preserve unrelated values, read back |
| Notifications | Inbox read and check/uncheck; source-health report/clear | Checking acknowledges a notice; only verified reconnection clears source issue |
| Schedules | VM review read/update; Chat foreground schedule read/update | Separate destinations and actual execution requirements; never claim a ChatGPT cloud task was created by editing Planner settings |
| Screen Time | Device command queue/read/cancel; saved native groups and task rules; cloud DNS tools | Queue is not execution. Native operations require an available foreground device and OS authorization. Cloud DNS works independently only when configured; it does not prove app-launch blocking |
| UI navigation | Validated device/client commands | A direct web MCP call cannot execute a relay-only client response. Use queued device commands and actual acknowledgements for native/UI operations; use server data tools for saved state |
| External websites | Authorized Google tools, existing browser tools; ChatGPT's own browser separately | Login/MFA/source permissions remain real requirements; never claim a browser session or file was read merely from its link |

## File lifecycle

1. Discover exact destination and latest Files revision.
2. Start an upload with the real filename, MIME and size; upload original bytes directly to the returned signed URL using PUT and the specified Content-Type.
3. Finish with the ticket ID, destination and current revision. On conflict, reread and retry finish; do not upload the same bytes again. The same successfully registered ticket/destination safely replays.
4. For an edited binary, use a fresh upload ticket and `replaceId` for the existing attachment. The visible ID/name and unrelated data survive. This is binary replacement, not a promise of an in-app Office editor or lossless document conversion.
5. Read the registered document back; use download to retrieve the original stored bytes. Download URLs expire in 60 seconds. Notes return UTF-8 content; links explicitly remain links.

Use `planner_capabilities` with `section: "overview"`, then a specific returned section, to avoid requesting the entire guide unnecessarily. Mutating tools accurately advertise `destructiveHint`; ChatGPT controls its own approval UX.

## Status

Implementation and regression tests are distinct from signed-in web acceptance. Record actual web test results after account linking. Do not claim complete app parity, actual native shielding, unattended ChatGPT scheduling or source access from catalog presence alone. Test chats stay inside ChatGPT project Test; disposable saved artifacts stay under Files/Agent/Test/Agent. Preserve real calendars, grades, Work and To-do throughout QA.
