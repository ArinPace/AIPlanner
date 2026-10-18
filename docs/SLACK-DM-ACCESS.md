# Slack direct-message access

Agent Settings → Add sites → Slack includes the same selected-conversation permission used for other messaging sources. Revocation is checked from current server settings before every tool connection.

`browser_list_slack_dms(workspace)` lists existing sidebar DM names and URLs in the selected connected workspace. `browser_read_slack_dm(workspace, name | url)` opens exactly one selected existing DM and returns up to 50 rendered messages. Ambiguous names, mismatched workspaces, channel URLs and compose URLs are rejected. This does not send messages, react, create conversations or join channels. Opening a conversation may mark messages read. Attachments, unloaded history and unopened reply threads are not covered. Collapsed/unloaded sidebar conversations may require the existing DM URL.

Generic `browser_read` continues to reject DM URLs. DM reads use their own tool and honest non-read-only annotation because of read receipts. A real user-selected runtime **Always allow this tool** decision is restored across runs for this exact tool and host, only while current Slack permission remains valid. No WhatsApp approval is reused for Slack.

Tests cover source permission, URL restrictions, exact selection, workspace mismatch and excluding composer text. A live check of the saved NYU Stern session discovered 11 existing DMs without reading message bodies. A named live DM read still requires selection of the person/workspace and any runtime approval shown to the user.

Production planner-agent verification `a580c4f0-ea7d-4eab-add2-ebee186ed65f` also completed successfully through `browser_list_slack_dms`: 11 existing conversations, no message bodies requested or read. Slack selected-conversation permission was enabled for the requesting account; other users control it through Add sites.

## Existing-chat compatibility

The runtime retained an older developer instruction prohibiting DMs in existing chat history despite `thread/resume` receiving updated instructions. `refreshRuntimeInstructions` now appends the current app-owned developer instructions using `thread/inject_items` when their hash changes. Conversation history remains intact. Only application instructions enter this role, never user messages or website/tool content. Verification `b97d9c20-affc-4b48-955c-cc6c1ce27788` succeeded in the previously failing chat: 11 conversations listed.

DM IDs and people are not hardcoded or individually enabled. New existing DM URLs work through the same workspace and source-permission checks. When a requested name is not initially listed, the reader tries Slack's existing sidebar filter and restores its previous value. Duplicate exact names require a selected URL.
