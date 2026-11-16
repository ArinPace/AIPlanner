# WHOOP automatic updates

Planner uses WHOOP OAuth v2 and signed webhooks on Vercel. No browser screenshots, remote machine, or hourly AI check is needed after connecting OAuth. Existing browser-only connections retain their fallback until replaced.

## One-time setup

1. Sign into https://developer-dashboard.whoop.com and create a developer app. Follow WHOOP's app requirements, including its privacy-policy and allowed-user requirements. Development apps may be limited to approved test users.
2. Register this exact redirect URL:
   `https://aiplanner-ten.vercel.app/api/whoop/callback`
3. Register this webhook URL and select **v2** model:
   `https://aiplanner-ten.vercel.app/api/whoop/webhook`
4. Enable read-only scopes: `read:profile`, `read:sleep`, `read:recovery`, and `offline`. Planner does not request permission to edit health records.
5. In the Vercel project's production environment, save **WHOOP_CLIENT_ID** and **WHOOP_CLIENT_SECRET** from the developer dashboard, then redeploy. Never put these in `VITE_*` variables or paste the secret into chat. The existing **CONNECTION_ENCRYPTION_KEY** encrypts OAuth tokens; **CRON_SECRET** protects quiet reconciliation.
6. Open **Add sites → Health → WHOOP → Connect**, authorize your own WHOOP account, then return to Planner. On iPhone authorization opens in Safari; return to the existing app after consent. The connection status refreshes when the app regains focus. The server callback verifies the account and imports recent data.
7. Keep the intended review channel enabled in Planner's existing review settings. Connecting WHOOP enables its data source but does **not** enable a disabled AI schedule or start/provision a remote worker.

## What wakes up, and when

- Signed sleep/recovery webhooks are persisted and fetch current data directly from WHOOP. V2 recovery notifications identify the **sleep**, so Planner resolves its cycle before reading recovery.
- Meaningful changes to a recent scored record, or deletion of a previously known recent record, arm an enabled review once. Pending/unchanged records do not wake an AI. Sleep and recovery notifications coalesce for 30 seconds.
- OAuth connections bypass the old hourly browser retry. A review consumes the pending change; later new data can trigger another review. Failed processing remains in the webhook inbox and provider delivery is retried. Daily quiet reconciliation catches missed deliveries without posting chat messages.
- **Receiving data in the cloud and executing AI are separate.** The ChatGPT subscription relay can consume a pending review only while Planner is open and ready. A ChatGPT cloud scheduled task cannot be triggered by an arbitrary webhook through this relay. The integration does not claim to wake ChatGPT while the phone is closed. Existing separately configured Agent workers may consume events through their existing schedule; nothing new is provisioned or enabled.
- The AI reads `planner_whoop_read` for API observations and `planner_whoop_review_read/report` for reconciliation state. Calendar publication still uses the normal staged revision safeguards. Receiving a webhook alone never marks the calendar reconciled or marks a task completed.
- Numeric timezone offsets are retained as provided; they are not invented IANA timezone names. Actual sleep uses the sum of light, slow-wave and REM stages, rather than time in bed. Pending data never establishes that a person is awake or asleep.

## Verification

Automated tests cover signature/timestamp validation, invalid OAuth state/cookie binding, encryption, scopes, record ownership, duplicate/reordered deliveries, API failures, refresh-token rotation, deleted records, quiet processing and scheduler behavior. A database transaction test checks permissions, meaningful-change detection and removal of hourly retries, then rolls back fixture data.

Live account authorization and an authentic WHOOP webhook require completing the setup above. Until then the UI says **Developer app setup needed**; no connection or live webhook delivery is claimed. To verify delivery, use the WHOOP developer dashboard and a natural device sync; avoid changing health records merely to generate a test event.

Reference: [OAuth](https://developer.whoop.com/docs/developing/oauth/), [webhooks](https://developer.whoop.com/docs/developing/webhooks/), [sleep](https://developer.whoop.com/docs/developing/user-data/sleep/), [recovery](https://developer.whoop.com/docs/developing/user-data/recovery/).
