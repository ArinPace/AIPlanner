const slackChannel = url => url.hostname === 'app.slack.com' && /^\/client\/[^/]+\/[CDG][A-Z0-9]+\/?$/.test(url.pathname)

export async function readBrowserPage(context, destination, { slackTimeout = 45000, validate = () => {}, inspect } = {}) {
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
    if (/(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(new URL(page.url()).pathname) || await page.locator('input[type=password]:visible').count() > 0) throw new Error('This website needs sign-in. Reconnect it before reading content.')
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
    const images = await page.locator(slack ? '[data-qa="message_container"] img:not(.c-avatar__image)' : 'img').evaluateAll(nodes => nodes.filter(n => n.naturalWidth >= 80 && n.naturalHeight >= 80 && n.getBoundingClientRect().width >= 80 && n.getBoundingClientRect().height >= 80).map((n,index) => ({ index, alt: n.alt || 'Image', width: n.naturalWidth, height: n.naturalHeight, messageTimestamp: n.closest('[data-msg-ts]')?.getAttribute('data-msg-ts') || null })))
    const shadowText = slack ? '' : await page.locator('body').evaluate(body => {
      const parts = []
      function visit(root) {
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) {
          const walker = document.createTreeWalker(el.shadowRoot,NodeFilter.SHOW_TEXT)
          while (walker.nextNode()) {
            const n = walker.currentNode, p = n.parentElement
            if (p && !p.closest('style,script,noscript') && p.getClientRects().length && getComputedStyle(p).visibility !== 'hidden' && n.textContent.trim()) parts.push(n.textContent.trim())
          }
          visit(el.shadowRoot)
        }
      }
      visit(body)
      return parts.join('\n').slice(0,40000)
    })
    // Albert renders its student pages in an NYU SIS frame. Read only frames
    // whose destinations independently pass the enabled-source policy.
    const frames = []
    for (const frame of page.frames().filter(f => f !== page.mainFrame()).slice(0, 10)) {
      try {
        validate(frame.url())
        if (!frame.url().startsWith('https://') || /(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(new URL(frame.url()).pathname) || await frame.locator('input[type=password]:visible').count()) continue
        const text = await frame.locator('body').innerText({ timeout: 1500 })
        frames.push({ url: frame.url(), text: text.slice(0, 20000) })
      } catch { /* Unsupported frames and SSO pages are not source content. */ }
    }
    const result = {
      title: await page.title(), url: page.url(),
      text: messages ? messages.map(m => m.text).join('\n\n').slice(-40000) : ((await page.locator('body').innerText())+'\n'+shadowText+'\n'+frames.map(f=>f.text).join('\n')).slice(0, 50000),
      ...(frames.length ? { frames } : {}),
      links: await page.locator('a[href]').evaluateAll(nodes => nodes.slice(0, 200).map(n => ({ text: n.textContent?.trim().slice(0,160), url: n.href }))),
      images,
      ...(messages ? { messages, coverage: 'Latest rendered channel messages after scrolling to the end. browser_read automatically includes image pixels; browser_view_image can inspect additional images.' } : {}),
    }
    return inspect ? await inspect(page, result, slack) : result
  } finally { if (!existing) await page.close() }
}
