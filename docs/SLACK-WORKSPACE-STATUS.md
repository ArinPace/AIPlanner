# Slack workspace lookup — October 18, 2026

Channel discovery now supports Slack's current `data-qa-channel-sidebar-channel-id` and suffixed channel-name attributes. It tries already-rendered channels before filtering, dismisses obstructing search overlays, restores the prior sidebar filter, and no longer waits for an obsolete Channels-plus control.

`browser_find_slack_channel` accepts the exact workspace name. It discovers workspace IDs from the authenticated workspace sidebar, selects an exact connected workspace when available, and returns `SLACK_WORKSPACE_UNAVAILABLE` with connected workspace metadata when absent. A same-named channel in another workspace is never substituted. Browser-read output also includes workspace navigation metadata. No workspace/channel is joined and no DMs are inspected by this lookup.

Live verification found only **NYU Stern** in the retained authenticated Slack session. The regular Chrome profile showed Slack's public landing page. The updated lookup resolves NYU Stern's `general` to `https://app.slack.com/client/E033744N8CX/C01T4NV9AS1`, and refuses to substitute it for BTE's `general`. BTE must be connected by the user in the VM. No BTE message-reading verification was possible, and no NYU message bodies were read during this navigation test.

All 37 worker tests pass, including modern ID extraction, DMs excluded from discovery, exact workspace selection, and missing-workspace handling.
