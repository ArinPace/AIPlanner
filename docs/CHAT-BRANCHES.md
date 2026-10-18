# Editing and branching conversations

Use **Branch chat** beneath a completed reply to create a separate conversation
through that reply. Use **Edit** on a sent message, revise it, and choose
**Save & branch** to generate a new response from the earlier history. The
original message, response and later conversation remain unchanged. Branching
does not undo changes an earlier agent run already saved to the planner.

Branches copy the owner-scoped chat history and private attachment payloads
through the selected cutoff. Edits exclude the edited original turn and every
later turn, then send the revised message with its original attachments. The
branch banner links back to the parent. Branches can be renamed, archived or
deleted like other chats, and their copied history survives removal of the
original chat.

Codex jobs save native turn IDs. Where a completed checkpoint is available, the
first branch run uses `thread/fork` with `lastTurnId`, preserving native context
through exactly that turn. Older chats and other providers start an independent
session with the saved cutoff transcript and uploaded attachments. The fallback
explicitly excludes unreplayed browser/tool outputs; the agent must recheck
those facts when needed. Later source messages are never replayed.

Database operations are atomic and derive the owner from the signed-in session.
Branch context, native thread IDs and attachment bytes are excluded from public
chat lists. The snapshot size limit is 12 MiB. Native forks do not reuse the
original thread for new turns. A currently running original task is left alone.

Checks include cutoff/owner isolation and original preservation in a rolled-back
database transaction, attachment input tests, build/lint, and production UI
branch/edit workflow verification.
