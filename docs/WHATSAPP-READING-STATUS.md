# WhatsApp reading status — October 18, 2026

Sign-in is verified on the saved regular Chrome VM profile. Sign-in detection uses authenticated controls rather than conversation text. The reader reuses that profile/tab, waits for readiness, and can select one exact chat name; its text reader excludes the composer and unrelated previews. Older history and media remain outside its current coverage.

The owner explicitly authorized reading selected chats including possible read receipts. This consent is stored in `planner_vm_settings.whatsapp_read_consent_at`, exposed/revocable under Add sites > WhatsApp, included in runtime instructions, and checked against current server configuration before each tool read. Other users are opted out by default. This does not authorize sending messages or overriding safety decisions.

The planner now relays supported runtime questions and simple MCP confirmation forms to an in-chat decision card. Responses are owner-, task-, host- and lease-scoped, expire after five minutes, and must match displayed choices. Nothing is preselected or automatically granted. Scheduled runs retain the unattended policy. Unknown permission/command requests remain blocked.

Production build, 35 worker tests, focused approval validation/bridge tests, saved-permission UI and desktop/mobile decision-card fixtures passed. The approval table has RLS enabled and no public/anonymous/authenticated grants.

**Actual message access remains blocked.** Real Arnav-chat verification attempts were rejected by runtime safety review, including after saved consent and interactive approval support. The latest run returned `user rejected MCP tool call`; no server-initiated approval request was emitted, and no messages were read. Do not claim this integration has passed end-to-end message-reading verification. Do not change tool annotations, hide read-receipt effects, invoke an alternative tool, or grant permissions automatically to evade the rejection. Record any future explicit runtime approval separately from this app-level consent.
