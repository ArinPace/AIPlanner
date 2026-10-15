import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { allowedLivePath } from './browser-access.mjs'
import { signedInPage, brightspaceCourse } from './site-status.mjs'

export const sources = {
  brightspace: 'https://brightspace.nyu.edu/', gradescope: 'https://www.gradescope.com/',
  gmail: 'https://mail.google.com/mail/u/0/', calendar: 'https://calendar.google.com/calendar/u/0/r',
  drive: 'https://drive.google.com/drive/u/0/my-drive', slack: 'https://app.slack.com/',
  instagram: 'https://www.instagram.com/', x: 'https://x.com/home',
}
let context, live
export async function browser(dataDir) {
  if (!context) {
    await mkdir(path.join(dataDir, 'browser'), { recursive: true, mode: 0o700 })
    context = await chromium.launchPersistentContext(path.join(dataDir, 'browser'), {
      headless: false, viewport: null, env: { ...process.env, DISPLAY: ':99' },
      args: ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1', '--window-size=1440,900'],
    })
    context.on('close', () => { context = null })
  }
  return context
}
export const liveBrowserOpen = () => Boolean(live)
export async function shutdownBrowser() { await closeLiveBrowser(); if (context) await context.close() }
export async function closeLiveBrowser() {
  if (!live) return
  clearTimeout(live.timer); live.tunnel.kill(); live.proxy.closeAllConnections(); live.proxy.close();
  for (const socket of live.sockets) socket.destroy()
  live = null
}
export async function openLogin(dataDir, source, keepOpen = false) {
  if (!(source in sources)) throw new Error('Choose a supported website.')
  let destination = sources[source]
  if (source === 'gradescope') {
    const saved = JSON.parse(await readFile(path.join(dataDir, 'site-launches.json'), 'utf8').catch(() => '{}'))
    destination = brightspaceCourse(saved.gradescope) || sources.brightspace
  }
  const result = await openView(dataDir, destination)
  if (live) { live.source = source; live.keepOpen = keepOpen; live.reported = false }
  if (source === 'gradescope') {
    const page = context.pages()[0]
    // Use only an unambiguous Gradescope link in the course, preserving its
    // Brightspace launch action rather than copying an expiring LTI URL.
    for (const frame of page.frames()) {
      const link = frame.getByRole('link', { name: /gradescope/i })
      if (await link.count() === 1) { await link.click({ timeout: 5000 }).catch(() => {}); break }
    }
  }
  return result
}

export async function observeSignIn(dataDir) {
  if (!live?.source || live.reported || !context) return {}
  const source = live.source
  for (const page of context.pages()) {
    if (new URL(page.url()).hostname.replace(/^www\./,'') !== new URL(sources[source]).hostname.replace(/^www\./,'')) continue
    const text = await page.locator('body').innerText({ timeout: 1500 }).catch(() => '')
    if (!signedInPage(source, page.url(), text, await page.locator('input[type=password]:visible').count().catch(() => 0) > 0)) continue
    if (source === 'gradescope') {
      for (const candidate of [...context.pages()].reverse()) {
        const course = brightspaceCourse(candidate.url())
        if (course) { await writeFile(path.join(dataDir, 'site-launches.json'), JSON.stringify({ gradescope: course }), { mode: 0o600 }); break }
      }
    }
    live.reported = true
    const result = { [source]: { ready: true } }
    // Open-site views remain interactive; connection views finish automatically.
    if (!live.keepOpen) await closeLiveBrowser()
    return result
  }
  return {}
}
export async function openView(dataDir, destination, attempt = 0) {
  await closeLiveBrowser()
  const ctx = await browser(dataDir), page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(destination, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  const token = randomBytes(24).toString('base64url'), sockets = new Set()
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }
  const proxy = http.createServer((req, res) => {
    if (!allowedLivePath(req.url, token)) { res.writeHead(404, headers); res.end(); return }
    const upstream = http.request({ hostname: '127.0.0.1', port: 6080, path: req.url.slice(token.length + 1), method: req.method, headers: { host: '127.0.0.1:6080' } }, response => {
      res.writeHead(response.statusCode || 502, { ...response.headers, ...headers }); response.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() }); req.pipe(upstream)
  })
  proxy.on('upgrade', (req, socket, head) => {
    if (!allowedLivePath(req.url, token)) { socket.destroy(); return }
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    const upstream = http.request({ hostname: '127.0.0.1', port: 6080, path: req.url.slice(token.length + 1), headers: req.headers })
    upstream.on('upgrade', (response, remote, extra) => {
      sockets.add(remote); remote.on('close', () => sockets.delete(remote))
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n')
      if (extra.length) socket.write(extra); if (head.length) remote.write(head)
      socket.pipe(remote); remote.pipe(socket)
      socket.on('error', () => remote.destroy()); remote.on('error', () => socket.destroy())
    })
    upstream.on('error', () => socket.destroy()); upstream.end()
  })
  await new Promise(resolve => proxy.listen(6081, '127.0.0.1', resolve))
  const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--edge-ip-version', '4', '--url', 'http://127.0.0.1:6081'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const current = { proxy, tunnel, sockets, timer: setTimeout(() => void closeLiveBrowser(), 20 * 60000) }; live = current
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not open the private browser view. Try again.')), 45000)
    let buffer = ''
    tunnel.stderr.on('data', chunk => { buffer = (buffer + chunk).slice(-4000); const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (match) { clearTimeout(timer); resolve(match[0]) } })
    tunnel.on('error', () => { clearTimeout(timer); reject(new Error('The browser connection service is unavailable.')) })
  }).catch(async error => { await closeLiveBrowser(); throw error })
  // Avoid a premature lookup: some local resolvers cache NXDOMAIN for a newly
  // allocated hostname even after Cloudflare publishes its DNS record.
  await new Promise(resolve => setTimeout(resolve, 5000))
  // cloudflared announces its hostname before DNS and the public route are
  // ready. Publish the view only after an end-to-end request succeeds.
  let available = false
  let readinessReason = 'not checked'
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && live === current) {
    try {
      const response = await fetch(`${origin}/${token}/vnc.html`, { signal: AbortSignal.timeout(5000) })
      const html = await response.text()
      readinessReason = `HTTP ${response.status}; viewer ${/novnc/i.test(html) ? 'present' : 'missing'}`
      if (response.ok && /novnc/i.test(html)) { available = true; break }
    } catch (error) { readinessReason = error.cause?.code || error.name }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!available) {
    console.error('Private browser readiness failed:', readinessReason)
    await closeLiveBrowser()
    // A newly allocated quick-tunnel hostname can be unresolvable on a local
    // resolver even though the tunnel is connected. Try a fresh route once.
    if (attempt === 0) return openView(dataDir, destination, 1)
    throw new Error('The private browser could not connect. Please try Connect again.')
  }
  // Xvfb has a fixed display size. Scaling keeps the full guest browser usable
  // on phones and narrow windows without cropping the sign-in form.
  return { liveUrl: `${origin}/${token}/vnc.html?autoconnect=1&resize=scale&path=${token}/websockify`, expiresAt: new Date(Date.now() + 20 * 60000).toISOString() }
}
export async function checkSites(dataDir, enabled) {
  await closeLiveBrowser()
  const ctx = await browser(dataDir), sites = {}
  for (const source of enabled) {
    if (!(source in sources)) continue
    let existing = false
    for (const current of ctx.pages()) {
      const text = await current.locator('body').innerText({ timeout: 1500 }).catch(() => '')
      if (signedInPage(source, current.url(), text, await current.locator('input[type=password]:visible').count().catch(() => 0) > 0)) { existing = true; break }
    }
    if (existing) { sites[source] = { ready: true }; continue }
    if (source === 'gradescope') { sites[source] = { ready: false }; continue }
    const page = await ctx.newPage()
    try {
      await page.goto(sources[source], { waitUntil: 'domcontentloaded', timeout: 40000 })
      await page.waitForTimeout(2000)
      const text = (await page.locator('body').innerText()).slice(0, 12000)
      sites[source] = { ready: signedInPage(source, page.url(), text, await page.locator('input[type=password]:visible').count() > 0) }
    } catch { sites[source] = { ready: false } } finally { await page.close() }
  }
  return { sites }
}
