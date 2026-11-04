# Chat conversation sync

The iPhone Chat relay maps Planner chats to canonical ChatGPT conversation URLs. It uses visible website controls, not a subscription API or private ChatGPT endpoints. New empty Planner chats stay local drafts until their first message creates a saved ChatGPT conversation while signed in. Guest sessions cannot create account sidebar history.

A successful turn binds its URL, saves the transcript, then reconciles its title. Metadata changes in Planner attempt sync immediately. The sidebar's Sync ChatGPT chats button reconciles all linked chats; an idle Chat tab also attempts this once per minute while no draft, attachment, settings dialog or active operation is present. It pauses while the ChatGPT session is exposed for manual interaction. These are foreground operations, not an unattended background service.

The backend stores the last acknowledged title, archive state and deletion state. Three-way comparison merges non-overlapping changes and presents conflicting edits for a user choice. Account ownership, exact URL binding, unique per-owner URL mappings and updated_at compare-and-swap protect saves. Missing sidebar rows and failed loads never count as deletion. Unrelated ChatGPT conversations are not imported or modified.

ChatGPT deletion is permanent; Planner asks before a linked conversation is moved to Bin and deleted remotely. The Planner copy remains recoverable under its existing Bin policy. Restoring that copy removes a confirmed deleted provider binding; a later message creates a new ChatGPT conversation. It does not restore the deleted ChatGPT conversation. Main Chat stays pinned, but can now be renamed, archived or deleted under the same mirror rules; when inactive, the default endpoint prefers a remaining active conversation.

A page observer records per-chat delete confirmations made inside the app's ChatGPT session. Only positively observed deletion of a previously verified linked chat propagates back. Deletes made in another browser/device that merely produce an unavailable page are reported for attention rather than guessed. Rename/archive pulls require readable metadata on the linked conversation page. Changed site markup, unsupported locale controls, authentication, a site-level dialog or an unsent website draft stop the operation and leave Planner changes pending.

## Verification

- Web and simulator native builds.
- Pure reconciliation tests and backend ownership, stale version, wrong URL and verified-ack tests.
- Exact native JavaScript against browser DOM fixtures: rename, archive, unarchive, confirmed delete, observer detection, stale-state refusal, guest rejection and missing controls.
- Planner UI/native bridge fixtures for outbound rename/unarchive/delete and inbound rename/archive.
- These fixtures do not establish real signed-in ChatGPT acceptance. The user declined simulator sign-in. Read-only metadata was observed on a real Chrome ChatGPT test chat; a later mutation test lost CDP, so its outcome was not verified. No private endpoints, login credentials or cookies were accessed.
