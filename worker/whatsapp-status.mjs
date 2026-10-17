// Inspect application controls only; message content is not sign-in evidence.
export async function whatsappSignedInPage(page) {
  let url
  try { url = new URL(page.url()) } catch { return false }
  if (url.protocol !== 'https:' || url.hostname !== 'web.whatsapp.com') return false
  const visible = selector => page.locator(selector).filter({ visible: true }).count().then(count => count > 0).catch(() => false)
  if (await visible('[data-ref] canvas, [data-testid="qrcode"], input[type="password"]')) return false
  const [sidebar, list, search, newChat, chats] = await Promise.all([
    visible('#side'),
    visible('#pane-side, [data-testid="chat-list"]'),
    visible('#side [role="searchbox"], #side [contenteditable="true"][role="textbox"], [aria-label="Search or start a new chat"]'),
    visible('[aria-label="New chat"]'),
    visible('[aria-label="Chats"]'),
  ])
  return sidebar && (list || chats) && (search || newChat)
}
