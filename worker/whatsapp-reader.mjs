import { whatsappSignedInPage, whatsappSearchSelector } from './whatsapp-status.mjs'

export async function waitForWhatsAppChat(page,chatName,timeout=15000){
  await page.waitForFunction(name=>{
    const normalize=value=>value.normalize('NFC').replace(/\s+/g,' ').trim()
    const visible=nodes=>[...nodes].filter(n=>n.getClientRects().length && getComputedStyle(n).visibility!=='hidden')
    const current=visible(document.querySelectorAll('#main header [data-testid="conversation-info-header-chat-title"]'))
    const fallback=current.length?current:visible(document.querySelectorAll('#main header [data-testid="conversation-info-header-chat-title-name"],#main header span[title]'))
    return fallback.length===1 && normalize(fallback[0].textContent || fallback[0].getAttribute('title') || '')===normalize(name)
  },chatName,{timeout}).catch(()=>{throw new Error('The opened WhatsApp chat did not match the requested name. No messages were read.')})
}

export async function readWhatsApp(context, { chatName, timeout = 45000, inspect } = {}) {
  let page = context.pages().find(p => { try { return new URL(p.url()).origin === 'https://web.whatsapp.com' } catch { return false } })
  if (!page) { page = await context.newPage(); await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout }) }
  const end = Date.now() + timeout
  while (!await whatsappSignedInPage(page)) {
    if (await page.locator('[data-ref] canvas:visible, [data-testid="qrcode"]:visible').count()) {
      const error = new Error('WhatsApp needs its QR-code sign-in. Reconnect WhatsApp.'); error.code = 'NEEDS_LOGIN'; throw error
    }
    if (Date.now() >= end) { const error = new Error('WhatsApp is still loading. Its saved login was not proven expired.'); error.code = 'WHATSAPP_NOT_READY'; throw error }
    await page.waitForTimeout(500)
  }
  if (!chatName) return { title: 'WhatsApp', url: page.url(), text: 'WhatsApp is signed in. Choose an exact chat or group name to read.', connected: true, coverage: 'Connection verified only; no conversations or previews read.', images: [], links: [] }
  const search = page.locator(whatsappSearchSelector).filter({ visible: true }).first()
  await search.fill(chatName)
  try {
    const match = page.locator('#pane-side [title], [data-testid="chat-list"] [title]').filter({ visible: true }).filter({ hasText: new RegExp('^' + chatName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') })
    await match.first().waitFor({ timeout: Math.min(timeout, 15000) })
    const exact = await match.evaluateAll((nodes, name) => nodes.filter(n => n.getAttribute('title') === name).length, chatName)
    if (exact !== 1) throw new Error('No unique exact WhatsApp chat was found. Supply its full displayed name.')
    await match.first().click()
    await page.locator('#main header').waitFor({ timeout: 15000 })
    await waitForWhatsAppChat(page,chatName,Math.min(timeout,15000))
    await page.locator('#main [data-pre-plain-text]').first().waitFor({ timeout: 15000 }).catch(() => {})
    const selector=await page.locator('#main [data-testid="msg-container"]').count()?'#main [data-testid="msg-container"]':await page.locator('#main .message-in,#main .message-out').count()?'#main .message-in,#main .message-out':'#main [data-pre-plain-text]'
    const messages = await page.locator(selector).evaluateAll(nodes => nodes.filter(n=>n.getClientRects().length).slice(-50).map(n => ({ timestamp: n.getAttribute('data-pre-plain-text') || n.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text'), text: n.innerText.slice(0, 10000) })))
    const result={ title: chatName, url: page.url(), text: messages.map(m => `${m.timestamp || ''}${m.text}`).join('\n\n').slice(-50000), messages, connected: true, coverage: 'Only the requested chat and its latest 50 rendered messages. Opening a chat may mark it read in WhatsApp. Unloaded history and unopened attachments are not included.', images: [], links: [] }
    return inspect?await inspect(page,result,selector,{limit:50}):result
  } finally { await search.fill('').catch(() => {}) }
}
