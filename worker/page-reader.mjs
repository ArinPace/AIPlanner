async function shadowTextFor(frame) { return await frame.locator('body').evaluate(body => {
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
}
import { isSlackWorkspace, isSlackChannel, slackMessages, waitForSource, gmailContent, slackChannels } from './source-readiness.mjs'
import { readGoogleDocument } from './google-doc-reader.mjs'
import { brightspaceContents } from './brightspace-reader.mjs'

export async function readBrowserPage(context, destination, { slackTimeout = 45000, validate = () => {}, inspect } = {}) {
  const target = new URL(destination)
  const slack = isSlackChannel(target)
  if(target.hostname==='app.slack.com' && /\/D[A-Z0-9]+(?:\/|$)/.test(target.pathname))throw new Error('Direct messages are outside this review. Choose a selected public channel.')
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
      await page.locator(slackMessages).first().waitFor({ timeout: slackTimeout }).catch(() => {
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
      await page.waitForTimeout(2000)
    }
    // Redirected credential pages must never be returned as page text.
    if (new URL(page.url()).hostname==='accounts.google.com' || /(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(new URL(page.url()).pathname) || await page.locator('input[type=password]:visible').count() > 0) {const error=new Error('This website needs sign-in. Reconnect it before reading content.');error.code='NEEDS_LOGIN';throw error}
    validate(page.url())
    const loaded=await waitForSource(page,new URL(page.url()))
    if(new URL(page.url()).hostname==='accounts.google.com' || await page.locator('input[type=password]:visible').count()>0){const error=new Error('This website needs sign-in. Reconnect it before reading content.');error.code='NEEDS_LOGIN';throw error}
    validate(page.url())
    const gmail=loaded?.kind.startsWith('gmail-')?await gmailContent(page,loaded.kind):null
    const documentText=await readGoogleDocument(context,page.url()).catch(()=>null)
    const courseContent=await brightspaceContents(context,page.url()).catch(()=>null)
    if(courseContent?.modules)courseContent.modules=await page.evaluate(modules=>modules.map(({descriptionHtml,...module})=>{const parsed=new DOMParser().parseFromString(descriptionHtml,'text/html');return {...module,links:[...parsed.querySelectorAll('a[href]')].map(a=>({text:a.textContent,url:a.getAttribute('href')})).filter(a=>/^https:\/\//.test(a.url)).slice(0,50)}}),courseContent.modules)
    const channelLinks=isSlackWorkspace(new URL(page.url()))?await slackChannels(page):null
    const messages = slack ? await page.locator(slackMessages).evaluateAll(nodes => nodes.map(n => {
      const stamp = n.querySelector('a[data-ts]')
      return {
        timestamp: n.getAttribute('data-msg-ts') || n.getAttribute('data-item-key'),
        author: n.querySelector('[data-qa="message_sender_name"],.c-message__sender')?.textContent?.trim() || null,
        time: stamp?.getAttribute('aria-label') || null,
        url: stamp?.getAttribute('href') || null,
        text: n.innerText.slice(0, 10000),
        links: [...n.querySelectorAll('a[href]')].map(a => ({ text: a.textContent?.trim().slice(0,160), url: a.href })).slice(0,30),
      }
    }).sort((a,b) => Number(a.timestamp)-Number(b.timestamp)).slice(-30)) : undefined
    const images = await page.locator(slack ? '[data-qa="message_container"] img:not(.c-avatar__image)' : 'img').evaluateAll(nodes => nodes.filter(n => n.naturalWidth >= 80 && n.naturalHeight >= 80 && n.getBoundingClientRect().width >= 80 && n.getBoundingClientRect().height >= 80).map((n,index) => ({ index, alt: n.alt || 'Image', width: n.naturalWidth, height: n.naturalHeight, messageTimestamp: n.closest('[data-msg-ts]')?.getAttribute('data-msg-ts') || null })))
    const shadowText = slack ? '' : await shadowTextFor(page)
    // Albert renders its student pages in an NYU SIS frame. Read only frames
    // whose destinations independently pass the enabled-source policy.
    const frames = []
    for (const frame of page.frames().filter(f => f !== page.mainFrame()).slice(0, 10)) {
      try {
        validate(frame.url())
        if (!frame.url().startsWith('https://') || /(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(new URL(frame.url()).pathname) || await frame.locator('input[type=password]:visible').count()) continue
        const doc=await readGoogleDocument(context,frame.url()).catch(()=>null)
        const text = doc?.text || ((await frame.locator('body').innerText({ timeout: 1500 }))+'\n'+await shadowTextFor(frame))
        const links=await frame.locator('a[href],d2l-link[href],d2l-link-image[href],[role="link"][href]').evaluateAll(nodes=>nodes.slice(0,100).map(n=>({text:n.textContent?.trim().slice(0,160),url:new URL(n.getAttribute('href'),document.baseURI).href})))
        frames.push({ url: frame.url(), text: text.slice(0, 20000), links,...(doc?{coverage:doc.coverage}:{}) })
      } catch { /* Unsupported frames and SSO pages are not source content. */ }
    }
    const result = {
      title: await page.title(), url: page.url(),
      text: documentText?.text || (gmail ? (gmail.messages?.map(m=>m.text).join('\n\n') || gmail.rows.map(r=>r.preview).join('\n\n')).slice(0,50000) : messages ? messages.map(m => m.text).join('\n\n').slice(-40000) : ((await page.locator('body').innerText())+'\n'+shadowText+'\n'+frames.map(f=>f.text).join('\n')).slice(0, 50000)),
      ...(gmail || documentText ? {coverage:gmail?.coverage || documentText.coverage,...(gmail?{gmail}:{}),...(documentText?{document:{truncated:documentText.truncated}}:{})}:{}),
      ...(!documentText && new URL(page.url()).hostname==='docs.google.com' && /\/(?:document|spreadsheets)\//.test(new URL(page.url()).pathname)?{coverage:'Document body unavailable. This is rendered UI/shell text only, not a verified document read. Check document permissions and the selected Google account.',document:{unavailable:true}}:{}),
      ...(channelLinks?{channels:channelLinks,coverage:slack?'Latest rendered public channel messages.':'Workspace navigation only; open a selected channel URL from channels before claiming any messages were checked.'}:{}),
      ...(frames.length ? { frames } : {}),
      ...(courseContent?{courseContent}:{}),
      links: [...(courseContent?.modules?.flatMap(m=>m.links) || []),...frames.flatMap(f=>f.links),...await page.locator('a[href],d2l-link[href],d2l-link-image[href],[role="link"][href]').evaluateAll(nodes => nodes.slice(0, 200).map(n => ({ text: n.textContent?.trim().slice(0,160), url:new URL(n.getAttribute('href'),document.baseURI).href })))].slice(0,300),
      images,
      ...(messages ? { messages, coverage: 'Latest rendered channel messages after scrolling to the end. browser_read automatically includes image pixels; browser_view_image can inspect additional images.' } : {}),
    }
    return inspect ? await inspect(page, result, slack) : result
  } finally { if (!existing) await page.close() }
}
