import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { readBrowserPage } from './page-reader.mjs'

test('Slack reader waits beyond the app shell, returns messages and keeps existing tabs', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const context = await browser.newContext()
    await context.route('https://app.slack.com/**', route => route.fulfill({ body: `<html><body>Loading Slack<script>setTimeout(()=>document.body.innerHTML='<div class="c-virtual_list__scroll_container"><div data-qa="message_container" data-msg-ts="123.456"><b data-qa="message_sender_name">Test sender</b><a data-ts="123.456" aria-label="Today at noon" href="https://example.test/message">Noon</a><p>Delayed channel message</p></div></div>',2500)</script></body></html>` }))
    const url = 'https://app.slack.com/client/E123/C123'
    const result = await readBrowserPage(context, url, { slackTimeout: 10000 })
    assert.equal(result.messages.length, 1)
    assert.equal(result.messages[0].author, 'Test sender')
    assert.match(result.text, /Delayed channel message/)
    assert.equal(context.pages().length, 0, 'Only a newly created reader tab is closed')
    const existing = await context.newPage(); await existing.goto(url)
    await readBrowserPage(context, url, { slackTimeout: 10000 })
    assert.equal(existing.isClosed(), false)
    await context.route('https://app.slack.com/client/E123/CEMPTY', route => route.fulfill({ body: 'Loading Slack' }))
    await assert.rejects(readBrowserPage(context, 'https://app.slack.com/client/E123/CEMPTY', { slackTimeout: 100 }), { code: 'SLACK_NOT_READY' })
  } finally { await browser.close() }
})
