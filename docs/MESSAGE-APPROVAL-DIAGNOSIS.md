# Corrected message approval diagnosis — October 18, 2026

Earlier status reports described message reads as automatically safety-rejected without emitting a user prompt. Further inspection disproved that diagnosis for the recorded approval failure:

- The affected thread was already configured with `approvalPolicy: on-request` and `approvals_reviewer: user`.
- The worker journal recorded `mcpServer/elicitation/request`, `mode: form`, with zero form fields at 06:50:15 UTC.
- `runtimeQuestions` rejected zero-field forms before storing a request. The RPC handler returned an error, which the runtime represented as `user rejected MCP tool call`. Counting rows in the approval table therefore missed an actual runtime approval event.

The handler now accepts object forms with no fields as explicit confirmations. It displays the actual request message with **Allow once** and **Decline**, with no preselection. Allow returns `{action: accept, content: {}}`; Decline returns `{action: decline, content: null}`. Both paths are tested. Missing action text, unsupported schemas, secret inputs and unsupported permission requests still fail closed. No tool annotations, provider safety checks, sandbox restrictions, or human decisions are bypassed.

The correction was deployed to the VM and pushed in commit `b319458`. A live WhatsApp request is testing the real user-confirmation path. Message-reading success remains unverified until the user grants that concrete request and the tool returns actual message bodies. Forwarding private messages elsewhere is not required to repair this bug, and no forwarding has been configured.

Read this correction alongside the historical results in WHATSAPP-READING-STATUS.md and SOCIAL-MESSAGE-STATUS.md. Those files accurately record zero messages read, but their assertions about no runtime request being emitted were incorrect.
