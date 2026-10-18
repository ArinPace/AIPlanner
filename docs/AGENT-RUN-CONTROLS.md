# Pause, resume and steering

Chat runs show Pause and Stop. Paused runs show Resume and Stop. The composer
remains usable during a run; sending a follow-up retires the old run and starts
a continuation in the same native conversation with the latest instruction.
Attachments and dictation remain usable while preparing that follow-up.

Pause preserves the message, partial response, native thread and attachments.
Resume requeues the same job with its saved context and tells the agent to check
existing data before repeating writes. Steering preserves the earlier turn in
history and displays the follow-up as a new user message. It does not silently
overwrite the original request.

The database serializes sends/controls by locking the owner-scoped chat. Its
unique active-job index includes paused jobs. Pausing or steering invalidates the
old job lease immediately, so stale reports and new planner MCP requests fail.
An action already in flight may finish; controls do not undo saved changes.

Workers checkpoint at two-second intervals with no overlapping heartbeat
requests. Codex uses native turn/interrupt before closing the runtime. Claude
stops its CLI process and retains its initialized native session mapping for
continuation. Resume and steering continue from saved conversation/context;
they do not freeze and restore CPU/process memory. Paused runs are not claimed
automatically and do not alone keep a VM awake.

Migration: agent_pause_steer. Function execution is restricted to service_role;
HTTP endpoints derive the owner from the authenticated session. Public job
responses exclude attachment payloads, continuation context and lease secrets.

Verification includes transaction rollback tests for pause/resume/steer,
partial-response retention, retired-lease rejection, owner scope and one active
job; worker monitor tests; UI and production workflow checks.
