# Corrected message approval diagnosis — October 18, 2026

Earlier status reports described message reads as automatically safety-rejected without emitting a user prompt. Further inspection disproved that diagnosis for the recorded approval failure:

- The affected thread was already configured with `approvalPolicy: on-request` and `approvals_reviewer: user`.
- The worker journal recorded `mcpServer/elicitation/request`, `mode: form`, with zero form fields at 06:50:15 UTC.
- `runtimeQuestions` rejected zero-field forms before storing a request. The RPC handler returned an error, which the runtime represented as `user rejected MCP tool call`. Counting rows in the approval table therefore missed an actual runtime approval event.

The handler now accepts object forms with no fields as explicit confirmations. It displays the actual request message with **Allow once** and **Decline**, with no preselection. Allow returns `{action: accept, content: {}}`; Decline returns `{action: decline, content: null}`. Both paths are tested. Missing action text, unsupported schemas, secret inputs and unsupported permission requests still fail closed. No tool annotations, provider safety checks, sandbox restrictions, or human decisions are bypassed.

The correction was deployed to the VM and pushed in commit `b319458`. A live WhatsApp request is testing the real user-confirmation path. Message-reading success remains unverified until the user grants that concrete request and the tool returns actual message bodies. Forwarding private messages elsewhere is not required to repair this bug, and no forwarding has been configured.

Read this correction alongside the historical results in WHATSAPP-READING-STATUS.md and SOCIAL-MESSAGE-STATUS.md. Those files accurately record zero messages read, but their assertions about no runtime request being emitted were incorrect.

## Verified WhatsApp repair

The user selected **Always allow this tool** for `browser_read_whatsapp_chat`. Each agent run starts a new runtime; the worker now restores that exact user/host-scoped saved decision using the supported per-tool `approval_mode = "approve"` configuration. It does not grant other tools, and requires the currently enabled source and source consent. Revoking/re-enabling source consent invalidates the older remembered grant; a newer displayed decline also takes precedence. No approval answer is submitted on the user's behalf.

WhatsApp also changed two controls: the selected chat name is rendered in `conversation-info-header-chat-title` without a `title` attribute, and sidebar search can be an `input[role=textbox]`. The reader waits for the exact visible chat title and uses a shared search selector with connection detection. Wrong or ambiguous titles still prevent message collection.

Live planner-agent test `0dc267b2-52c0-4bc9-83fa-9a4d247831f2` completed successfully: actual message bodies from the requested **Arnav** chat, **10 messages**, and zero new approval requests. No messages were sent. This supersedes the historical zero-message WhatsApp status; other messaging sites require separate verification.
