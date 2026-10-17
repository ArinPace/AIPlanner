# Browser message access — October 18, 2026

The requested approach uses the user's signed-in VM browser. No export/import feature was added. LinkedIn is registered throughout setup, source validation, browser routing, sign-in detection, account storage and planner/schedule tools. It uses the regular Chrome profile, like other new connections.

`browser_list_message_threads` returns up to 30 visible conversation names without previews. `browser_read_messages` opens one exact existing conversation by the returned name or validated thread URL and extracts up to 30 rendered message rows. Supported implementations: Instagram, X and LinkedIn. They do not send messages, react, compose, delete, guess/reset passcodes or bypass encryption. Opening conversations may mark messages seen. Media/attachments and unloaded history are explicitly not covered.

Users can grant/revoke each service's conversation-reading permission under Add sites. Other accounts default to no permission. Each invocation checks fresh enabled-source and consent state before touching the browser. Runtime instructions limit access to user-requested conversations or an explicitly authorized inbox review. WhatsApp is excluded from these tools so they cannot become an alternative route around its prior rejection.

The legacy browser connection now attaches to an already-running CDP browser instead of launching the same profile twice. Merely viewing an authenticated site in Open site no longer blocks an agent run; active connection/account-management flows still do.

Validation: production build passed; all 40 worker tests passed; source/update backend tests passed; production desktop and phone UI checks confirmed LinkedIn and saved per-service message permissions.

## Live outcomes

Planner agent run `38f62168-4191-4c4d-878c-082552e41eaf` completed:

- Instagram: **conversation listing verified**. Reading the selected test conversation was rejected before execution. Rollout diagnostics confirmed `user rejected MCP tool call`. Zero messages read; real message extraction remains unverified despite passing browser fixtures.
- X: **MESSAGES_UNLOCK_REQUIRED**. The signed-in account redirects Messages to `/i/chat/pin/recovery`; user must unlock encrypted chat in the VM. No passcode was inspected, entered, guessed or reset.
- LinkedIn: **NEEDS_LOGIN**. The source was enabled, but there is no authenticated LinkedIn inbox in the saved profile yet. User sign-in is required; message extraction remains fixture-tested only.
- WhatsApp: prior runtime safety rejection respected. No further message read attempted and no alternate browser/tool path used.

Do not claim all message services work. Do not alter annotations or grant permissions automatically to evade an approval rejection. Saved consent is authorization context, not an override of runtime safety decisions.
