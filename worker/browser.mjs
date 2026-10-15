import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { allowedLivePath } from './browser-access.mjs'

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
export async function openLogin(dataDir, source) {
  if (!(source in sources)) throw new Error('Choose a supported website.')
  return openView(dataDir, sources[source])
}
export async function openView(dataDir, destination) {
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
  const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:6081'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const current = { proxy, tunnel, sockets, timer: setTimeout(() => void closeLiveBrowser(), 20 * 60000) }; live = current
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not open the private browser view. Try again.')), 45000)
    let buffer = ''
    tunnel.stderr.on('data', chunk => { buffer = (buffer + chunk).slice(-4000); const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (match) { clearTimeout(timer); resolve(match[0]) } })
    tunnel.on('error', () => { clearTimeout(timer); reject(new Error('The browser connection service is unavailable.')) })
  }).catch(async error => { await closeLiveBrowser(); throw error })
  return { liveUrl: `${origin}/${token}/vnc.html?autoconnect=1&resize=remote&path=${token}/websockify`, expiresAt: new Date(Date.now() + 20 * 60000).toISOString() }
}
export async function checkSites(dataDir, enabled) {
  await closeLiveBrowser()
  const ctx = await browser(dataDir), sites = {}
  for (const source of enabled) {
    if (!(source in sources)) continue
    const page = await ctx.newPage()
    try {
      await page.goto(sources[source], { waitUntil: 'domcontentloaded', timeout: 40000 })
      await page.waitForTimeout(2000)
      const url = new URL(page.url()), text = (await page.locator('body').innerText()).slice(0, 6000)
      const expected = new URL(sources[source]).hostname.replace(/^www\./, '')
      const sameSite = url.hostname.replace(/^www\./, '') === expected
      const loginWall = /(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(url.pathname) || await page.locator('input[type=password]').count() > 0 || /sign in to continue|log in to gradescope|sign in to x|log in to instagram|sign in to your workspace|welcome to brightspace/i.test(text)
      const evidence = {
        brightspace: /\/d2l\/home/.test(url.pathname) && /my courses|course selector|select a course/i.test(text),
        gradescope: /\/account|\/courses\//.test(url.pathname) && /your courses|dashboard|assignments/i.test(text),
        gmail: /inbox|compose|drafts/i.test(text) && /\/mail\/u\/\d/.test(url.pathname),
        calendar: /create|my calendars|today/i.test(text) && /\/calendar\/u\/\d/.test(url.pathname),
        drive: /my drive|shared with me|my files/i.test(text) && /\/drive\/u\/\d/.test(url.pathname),
        slack: /\/client\//.test(url.pathname) && /channels|threads|direct messages/i.test(text),
        instagram: /messages|notifications/i.test(text) && !/sign up to see|log in to see/i.test(text),
        x: /\/home/.test(url.pathname) && /for you|following/i.test(text),
      }[source]
      sites[source] = { ready: sameSite && !loginWall && Boolean(evidence) }
    } catch { sites[source] = { ready: false } } finally { await page.close() }
  }
  return { sites }
}
