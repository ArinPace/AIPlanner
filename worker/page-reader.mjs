const slackChannel = url => url.hostname === 'app.slack.com' && /^\/client\/[^/]+\/[CDG][A-Z0-9]+\/?$/.test(url.pathname)

export async function readBrowserPage(context, destination, { slackTimeout = 45000, validate = () => {} } = {}) {
  const target = new URL(destination)
  const slack = slackChannel(target)
  const existing = slack && context.pages().find(p => {
    const u = new URL(p.url())
    return u.origin === target.origin && u.pathname === target.pathname && u.search === target.search
  })
  const page = existing || await context.newPage()
  try {
    if (!existing) await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: 45000 })
    if (slack) {
      // Slack hydrates well after DOMContentLoaded. A shell or sidebar alone
      // is not evidence that any channel messages have been read.
      await page.locator('[data-qa="message_container"][data-msg-ts]').first().waitFor({ timeout: slackTimeout }).catch(() => {
        const error = new Error('Slack opened, but its channel messages did not finish loading. No messages were verified. Reconnect Slack if it is asking for sign-in.')
        error.code = 'SLACK_NOT_READY'; throw error
      })
      // Read the latest end of Slack's virtualized message list, rather than
      // assuming the restored unread/history position is the newest message.
      for (let i = 0; i < 3; i++) {
        await page.locator('.c-virtual_list__scroll_container').evaluateAll(nodes => {
          for (const n of nodes) if (n.querySelector('[data-qa="message_container"]')) n.scrollTop = n.scrollHeight
        })
        await page.waitForTimeout(700)
      }
    } else {
      await page.waitForURL(u => u.hostname === target.hostname, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(2000)
    }
    // Redirected credential pages must never be returned as page text.
    validate(page.url())
    const messages = slack ? await page.locator('[data-qa="message_container"][data-msg-ts]').evaluateAll(nodes => nodes.map(n => {
      const stamp = n.querySelector('a[data-ts]')
      return {
        timestamp: n.getAttribute('data-msg-ts'),
        author: n.querySelector('[data-qa="message_sender_name"],.c-message__sender')?.textContent?.trim() || null,
        time: stamp?.getAttribute('aria-label') || null,
        url: stamp?.getAttribute('href') || null,
        text: n.innerText.slice(0, 10000),
        links: [...n.querySelectorAll('a[href]')].map(a => ({ text: a.textContent?.trim().slice(0,160), url: a.href })).slice(0,30),
      }
    }).sort((a,b) => Number(a.timestamp)-Number(b.timestamp)).slice(-30)) : undefined
    return {
      title: await page.title(), url: page.url(),
      text: messages ? messages.map(m => m.text).join('\n\n').slice(-40000) : (await page.locator('body').innerText()).slice(0, 50000),
      links: await page.locator('a[href]').evaluateAll(nodes => nodes.slice(0, 200).map(n => ({ text: n.textContent?.trim().slice(0,160), url: n.href }))),
      ...(messages ? { messages, coverage: 'Latest rendered channel messages after scrolling to the end; attachments are listed as text, not image contents.' } : {}),
    }
  } finally { if (!existing) await page.close() }
}
