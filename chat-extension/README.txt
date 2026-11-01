AI Planner Chat relay — 0.3.6 (desktop experiment)

Install this FOLDER, not the ZIP:
1. In Chrome open chrome://extensions.
2. Turn on Developer mode.
3. Click Load unpacked and choose this folder (it contains manifest.json).
4. Reload Planner and any already-open ChatGPT tab.
5. In Planner open Chat, then Open ChatGPT or Use existing tab.
6. Sign in to ChatGPT, choose Work if offered, and return to Planner.
7. Check connection and send a small text message; then test one small attachment.

Install separately in each Chrome profile you want to use.
Keep this folder in place while the unpacked extension is installed.
To upgrade, replace its files and click Reload on the extension.

What this package contains:
- manifest.json, background.js, planner.js and chatgpt.js
- No credentials, browser profiles, personal files, or API keys.

Current implementation:
- A separate ChatGPT tab processes prompts; Planner renders its output.
- Existing tab selection, project/conversation handling, prepared attachments,
  output file-card downloads, and native controls when ChatGPT exposes them.
- Attachment forwarding waits for ChatGPT to display each uploaded file.
  Current extension limit: four prepared files, 8 MB total.
- Secure sign-in opens the selected ChatGPT tab in a separate native window.
  Enter passwords in the actual secure form/browser; not in Planner chat.
- Hide minimizes a window; it does not remove the need for a running browser.
- Existing Agent-tab transport and its schedules remain separate.

Limits:
- This is a desktop prototype, not a tested iOS extension or native iOS app.
- It depends on ChatGPT page UI and can break when that UI changes.
- It is not yet verified end-to-end on your newly installed Mac extension.
- A fixture test is not proof that a live Brightspace/Albert login will work.
- ChatGPT's cloud browser is not embedded in Planner. Its secure handoff may
  still require you to use the ChatGPT window, including MFA/approvals.
- Browser/device sleep can interrupt forwarding; no unattended phone service.
