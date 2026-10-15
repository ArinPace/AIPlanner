// Personal, self-hosted SIWC enrollment. Tokens go straight into the selected VM.
import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const vm = process.argv[process.argv.indexOf('--vm') + 1]
if (!process.argv.includes('--vm') || !/^planner-[a-z0-9-]{1,40}$/.test(vm || '')) throw new Error('Usage: node scripts/connect-chatgpt.mjs --vm planner-arin')
const multipass = process.platform === 'win32' ? 'C:/Program Files/Multipass/bin/multipass.exe' : 'multipass'
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(multipass, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let output = ''
    child.stdout.on('data', data => output += data); child.stderr.resume(); child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error('Could not access the selected VM. Start it and finish provisioning first.')))
    child.stdin.end(input)
  })
}
const hostId = await run(['exec', vm, '--', 'sudo', '-u', 'planner', 'cat', '/var/lib/planner/host-id'])
if (!/^urn:uuid:[0-9a-f-]{36}$/.test(hostId)) throw new Error('The VM has no valid host identity yet.')
let previous = null
try { previous = JSON.parse(await run(['exec', vm, '--', 'sudo', '-u', 'planner', 'node', '-e', "const fs=require('fs');const c=JSON.parse(fs.readFileSync('/var/lib/planner/chatgpt.json'));console.log(JSON.stringify({client_id:c.client_id,subject:c.subject,email:c.email}))"])) } catch { /* First enrollment. */ }
const random = () => randomBytes(32).toString('base64url'), state = random(), nonce = random(), verifier = random()
const discovery = await (await fetch('https://auth.openai.com/.well-known/openid-configuration')).json()
if (discovery.issuer !== 'https://auth.openai.com') throw new Error('Unexpected OAuth issuer.')
for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) if (new URL(discovery[key]).origin !== discovery.issuer) throw new Error('Unexpected OAuth endpoint.')
const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
let callbackUri, completed = false
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  const url = new URL(req.url, callbackUri)
  if (req.method !== 'GET' || url.pathname !== '/auth/callback' || completed || url.searchParams.get('state') !== state) { res.writeHead(400); res.end('This sign-in could not be verified.'); return }
  completed = true
  try {
    if (url.searchParams.has('error')) throw new Error('Sign-in was declined. Start again when you are ready.')
    const clientId = url.searchParams.get('client_id') || previous?.client_id
    if (!clientId || clientId === 'dynamic_agent_client' || (previous && clientId !== previous.client_id)) throw new Error('The ChatGPT registration could not be verified.')
    const code = url.searchParams.get('code'); if (!code) throw new Error('Missing authorization code.')
    const response = await fetch(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: callbackUri, resource: 'https://api.openai.com/v1' }), signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('ChatGPT could not complete sign-in. Start a fresh attempt.')
    const tokens = await response.json()
    const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: discovery.issuer, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 })
    if (payload.nonce !== nonce || (previous && previous.subject !== payload.sub)) throw new Error('The selected ChatGPT account did not match.')
    const scopes = String(tokens.scope || '').split(' ')
    if (!scopes.includes('chatgpt.tokens.use.direct') || !tokens.access_token || !tokens.refresh_token) throw new Error('ChatGPT plan usage was not authorized. Enable it in ChatGPT and reconnect.')
    const credential = { ...tokens, scopes, client_id: clientId, subject: payload.sub, email: payload.email || null, issuer: discovery.issuer, saved_at_ms: Date.now() }
    const importer = "const fs=require('fs');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{JSON.parse(s);fs.writeFileSync('/var/lib/planner/chatgpt.json.tmp',s,{mode:0o600});fs.renameSync('/var/lib/planner/chatgpt.json.tmp','/var/lib/planner/chatgpt.json')})"
    await run(['exec', vm, '--', 'sudo', '-u', 'planner', 'node', '-e', importer], JSON.stringify(credential))
    res.end('ChatGPT is connected to your private planner VM. Return to AI Planner.'); console.log('ChatGPT connected. The VM owns token renewal; no credentials were printed or saved on Windows.')
  } catch (error) { res.writeHead(400); res.end(error.message); console.error(error.message); process.exitCode = 1 }
  finally { clearTimeout(timeout); server.close() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
callbackUri = `http://127.0.0.1:${server.address().port}/auth/callback`
const auth = new URL(discovery.authorization_endpoint)
auth.search = new URLSearchParams({ client_id: previous?.client_id || 'dynamic_agent_client', ...(!previous ? { agent_name_hint: 'AI Planner' } : previous.email ? { login_hint: previous.email } : {}), ext_agent_host_id: hostId, response_type: 'code', redirect_uri: callbackUri, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: 'https://api.openai.com/v1', state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString()
const timeout = setTimeout(() => { server.close(); console.error('Sign-in expired. Run the connection command again.'); process.exitCode = 1 }, 10 * 60000)
if (process.platform === 'win32') {
  const command = "Start-Process -FilePath '" + auth.href.replaceAll("'", "''") + "'"
  spawn('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' })
} else spawn('xdg-open', [auth.href], { stdio: 'ignore' })
console.log('Finish authorization in the browser on this computer. The listener expires in 10 minutes.')
