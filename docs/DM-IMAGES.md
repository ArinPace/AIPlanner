# Images in selected direct conversations

The dedicated WhatsApp, Slack, Instagram, X and LinkedIn conversation readers
return MCP image content blocks automatically. The agent receives actual pixels,
not just alt text or an image URL. The inbox-list tools still return names only.

Images are taken only from the latest rendered message rows of the validated,
selected conversation (50 for WhatsApp/Slack; 30 for the other services). The
newest four image candidates are attempted automatically. Their indices,
message-row positions, loaded state, attached indices and failures accompany
the response. Passing `imageIndex` to the same conversation reader selects an
additional listed image without using the public-page reader for private DMs.

The reader uses decoded browser pixels when available, including WhatsApp blob
images. Cross-origin canvas restrictions fall back to an image-element
screenshot. Images are bounded to 2400 pixels and an 8 MiB response budget.
Thumbnails may remain low resolution. No cookies, credentials, inbox-wide
screenshots or composer content are included. Images are processed transiently;
this does not copy them into Planner Files or enable browser recordings.

Existing source enablement, conversation selection, saved consent and runtime
approval requirements still apply. Reading can mark messages seen. The tools
never send messages. Unloaded images, unopened files, disappearing/view-once
media, video, audio, and older history are not covered. The agent must report
unavailable or unreadable details rather than claim complete media coverage.

Tests: `node --test worker/message-images.test.mjs
worker/whatsapp-reader.test.mjs worker/slack-messages.test.mjs
worker/selected-messages.test.mjs`. Fixtures verify all five services' message
selectors, actual returned image pixels, image-only conversations, scoping,
limits, unavailable images, and page lifetime.
