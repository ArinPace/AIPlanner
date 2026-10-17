import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { whatsappSignedInPage } from './whatsapp-status.mjs'

test('WhatsApp recognizes authenticated controls without inspecting conversations', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage()
    await page.route('https://**/*', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }))
    await page.goto('https://web.whatsapp.com/')
    const shell = '<div id="side"><button aria-label="Chats"></button><button aria-label="New chat"></button><div contenteditable="true" role="textbox" aria-label="Search or start a new chat"></div><div id="pane-side" data-testid="chat-list">log into WhatsApp scan QR link with phone number</div></div>'
    await page.setContent(shell)
    assert.equal(await whatsappSignedInPage(page), true)
    await page.setContent(shell + '<div data-ref style="display:none"><canvas></canvas></div>')
    assert.equal(await whatsappSignedInPage(page), true)
    await page.setContent('<div data-ref><canvas></canvas></div>')
    assert.equal(await whatsappSignedInPage(page), false)
    await page.setContent('<div>Loading WhatsApp</div>')
    assert.equal(await whatsappSignedInPage(page), false)
    await page.goto('https://web.whatsapp.com.evil.test/')
    await page.setContent(shell)
    assert.equal(await whatsappSignedInPage(page), false)
  } finally { await browser.close() }
})
