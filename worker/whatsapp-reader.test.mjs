import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { readWhatsApp, waitForWhatsAppChat } from './whatsapp-reader.mjs'

test('WhatsApp reuses its saved tab, waits for controls, and reads only the selected chat', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const context = await browser.newContext()
    await context.route('https://web.whatsapp.com/**', route => route.fulfill({ contentType: 'text/html', body: '<body></body>' }))
    const page = await context.newPage(); await page.goto('https://web.whatsapp.com/')
    await page.setContent(`<div id="side"><input role="searchbox"><div id="pane-side"><span title="Course group" onclick="document.querySelector('#main').hidden=false">Course group</span><span title="Unselected">Private preview</span></div></div><div id="main" hidden><header><span title="Course group">Course group</span></header><div data-pre-plain-text="[10:00] Alex: ">Selected homework update</div><div contenteditable="true">Do not send</div></div>`)
    const status = await readWhatsApp(context, { timeout: 1000 })
    assert.equal(status.connected, true)
    assert.ok(!JSON.stringify(status).includes('Private preview'))
    assert.equal(context.pages().length, 1)
    const result = await readWhatsApp(context, { chatName: 'Course group', timeout: 1000 })
    assert.match(result.text, /Selected homework update/)
    assert.ok(!result.text.includes('Private preview'))
    assert.ok(!result.text.includes('Do not send'))
    assert.equal(await page.locator('[role="searchbox"]').inputValue(), '')
    assert.equal(await page.locator('#main [contenteditable]').innerText(), 'Do not send')
    await page.setContent('<div data-ref><canvas></canvas></div>')
    await assert.rejects(readWhatsApp(context, { timeout: 100 }), { code: 'NEEDS_LOGIN' })
    await page.setContent('<div>Loading</div>')
    await assert.rejects(readWhatsApp(context, { timeout: 100 }), { code: 'WHATSAPP_NOT_READY' })
  } finally { await browser.close() }
})

test('WhatsApp waits for the real header title and rejects stale, ambiguous or unrelated labels',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage()
  await page.setContent('<div id="main"><header><div title="Profile details"></div><div data-testid="conversation-info-header-chat-title-name"><span data-testid="conversation-info-header-chat-title">Old chat</span></div></header></div>')
  await page.evaluate(()=>setTimeout(()=>document.querySelector('[data-testid="conversation-info-header-chat-title"]').textContent='Arnav',400))
  await waitForWhatsAppChat(page,'Arnav',2000)
  await page.locator('[data-testid="conversation-info-header-chat-title"]').evaluate(n=>n.textContent='Other person')
  await assert.rejects(()=>waitForWhatsAppChat(page,'Arnav',300),/No messages were read/)
  await page.setContent('<div id="main"><header><div title="Arnav">Profile details</div><span dir="auto">Arnav</span></header></div>')
  await assert.rejects(()=>waitForWhatsAppChat(page,'Arnav',300))
  await page.setContent('<div id="main"><header><span data-testid="conversation-info-header-chat-title" hidden>Other</span><span data-testid="conversation-info-header-chat-title">Arnav</span></header></div>')
  await waitForWhatsAppChat(page,'Arnav',500)
 }finally{await browser.close()}
})
