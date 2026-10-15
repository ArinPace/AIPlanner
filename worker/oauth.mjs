import http from 'node:http'
import path from 'node:path'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { randomBytes, createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { openView } from './browser.mjs'

let pending
export async function disconnectPersonalChatGpt(dataDir) {
  if (pending) { clearTimeout(pending.timer); pending.server.close(); pending = null }
  await unlink(path.join(dataDir, 'chatgpt.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
}
export async function connectPersonalChatGpt(dataDir, hostId) {
  if (pending) { clearTimeout(pending.timer); pending.server.close(); pending = null }
  let previous
  const filename = path.join(dataDir, 'chatgpt.json')
  try { previous = JSON.parse(await readFile(filename, 'utf8')) } catch { /* First registration. */ }
  const response = await fetch('https://auth.openai.com/.well-known/openid-configuration', { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('OpenAI sign-in is temporarily unavailable.')
  const discovery = await response.json()
  if (discovery.issuer !== 'https://auth.openai.com') throw new Error('Unexpected sign-in issuer.')
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) if (new URL(discovery[field]).origin !== discovery.issuer) throw new Error('Unexpected sign-in endpoint.')
  const random = () => randomBytes(32).toString('base64url'), state = random(), nonce = random(), verifier = random()
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  let callback, consumed = false
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    const url = new URL(req.url, callback)
    if (req.method !== 'GET' || url.pathname !== '/auth/callback' || consumed || url.searchParams.get('state') !== state) { res.writeHead(400); res.end('Sign-in could not be verified.'); return }
    consumed = true
    try {
      if (url.searchParams.has('error')) throw new Error('Sign-in was declined. Return to Setup to try again.')
      const clientId = url.searchParams.get('client_id') || previous?.client_id, code = url.searchParams.get('code')
      if (!code || !clientId || clientId === 'dynamic_agent_client' || (previous && previous.client_id !== clientId)) throw new Error('The sign-in registration did not match. Start again in Setup.')
      const tokenResponse = await fetch(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, code_verifier: verifier, redirect_uri: callback, resource: 'https://api.openai.com/v1' }), signal: AbortSignal.timeout(20000) })
      if (!tokenResponse.ok) throw new Error('OpenAI could not complete sign-in. Start a new attempt.')
      const tokens = await tokenResponse.json()
      const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: discovery.issuer, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 })
      if (payload.nonce !== nonce || (previous && previous.subject !== payload.sub)) throw new Error('The ChatGPT account did not match the selected registration.')
      const scopes = String(tokens.scope || '').split(' ')
      if (!scopes.includes('chatgpt.tokens.use.direct') || !tokens.access_token || !tokens.refresh_token) throw new Error('ChatGPT plan usage was not authorized. Enable it in OpenAI settings and reconnect.')
      const value = { ...tokens, scopes, client_id: clientId, subject: payload.sub, email: payload.email || null, issuer: discovery.issuer, saved_at_ms: Date.now() }
      await writeFile(filename + '.tmp', JSON.stringify(value), { mode: 0o600 }); await rename(filename + '.tmp', filename)
      res.end('ChatGPT is connected. Return to AI Planner, then choose the websites you want to sign into.')
    } catch (error) { res.writeHead(400); res.end(error.message) }
    finally { if (pending?.server === server) { clearTimeout(pending.timer); pending = null } server.close() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  callback = `http://127.0.0.1:${server.address().port}/auth/callback`
  pending = { server, timer: setTimeout(() => { server.close(); pending = null }, 10 * 60000) }
  const authorize = new URL(discovery.authorization_endpoint)
  authorize.search = new URLSearchParams({ client_id: previous?.client_id || 'dynamic_agent_client', ...(!previous ? { agent_name_hint: 'AI Planner' } : previous.email ? { login_hint: previous.email } : {}), ext_agent_host_id: hostId, response_type: 'code', redirect_uri: callback, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: 'https://api.openai.com/v1', state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString()
  return openView(dataDir, authorize.href)
}
