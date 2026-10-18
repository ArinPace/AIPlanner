# Queued messages

While a chat has an active or paused task, Tab in the nonempty composer queues
the draft and attachments. Enter sends a steering follow-up immediately;
Shift+Enter adds a line. Empty-draft Tab, Shift+Tab and modified Tab retain normal
browser navigation. The Queue button provides the same action on touch devices.

Waiting messages are persisted as owner-scoped jobs with `waiting` status. They
do not interrupt the active task. After the current run finishes, the worker
claims them in creation order, one at a time, using the chat's latest native
thread at claim time. A paused task blocks its queue until resumed or stopped.
Each waiting message has a cancel button. Moving the chat to the Bin cancels
waiting and paused jobs as well as active jobs.

The existing unique index still allows only one queued/running/paused task per
chat; waiting messages do not occupy that slot. The claim function checks that
the chat is available and no earlier task occupies its slot. A queue-slot race
that rolls back with a unique-constraint conflict is retried once by the API.
Waiting messages wake the VM unless held by a paused task in their chat.

Checks cover non-interruption, FIFO, pause blocking, late thread binding,
attachment retention, cancellation, Bin cancellation, keyboard navigation, and
the production browser/agent workflow.

Production verification passed: Tab and the Queue button accepted back-to-back drafts, a queued text attachment was retained, cancellation prevented execution, Shift+Tab/empty Tab kept normal navigation, and paused work held the queue. After Resume, the turns ran in FIFO order and the last reply retained both the original ORIG31 context and queued attachment code QONE42. The temporary test chat was archived.
