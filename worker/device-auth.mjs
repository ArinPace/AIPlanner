// Personal self-hosted Codex only. Do not enable this for hosted customers.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexRpc } from './rpc.mjs'

let runtime, attempt
async function client(dataDir) {
  if (runtime) return runtime
  const home = path.join(dataDir, 'codex')
  await mkdir(home, { recursive: true, mode: 0o700 })
  const root = path.dirname(fileURLToPath(import.meta.url))
  const rpc = new CodexRpc(path.join(root, 'node_modules/.bin/codex'), ['app-server', '--listen', 'stdio://'], {
    env: { ...process.env, CODEX_HOME: home }, cwd: path.join(dataDir, 'workspace'),
  }, (method, params) => {
    if (method === 'account/login/completed' && attempt?.loginId === params.loginId) { clearTimeout(attempt.timer); attempt = null }
  })
  rpc.child.on('exit', () => { if (runtime === rpc) runtime = null })
  try { await rpc.initialize(); runtime = rpc; return rpc }
  catch (error) { rpc.close(); throw error }
}
export async function personalCodexStatus(dataDir) {
  const result = await (await client(dataDir)).request('account/read', { refreshToken: false })
  return result.account?.type === 'chatgpt' ? { type: 'codex', identity: result.account.email || 'ChatGPT' } : null
}
export async function connectPersonalDevice(dataDir) {
  const rpc = await client(dataDir)
  if (attempt) { clearTimeout(attempt.timer); await rpc.request('account/login/cancel', { loginId: attempt.loginId }).catch(() => {}); attempt = null }
  const result = await rpc.request('account/login/start', { type: 'chatgptDeviceCode' }, 60000)
  if (result.type !== 'chatgptDeviceCode' || result.verificationUrl !== 'https://auth.openai.com/codex/device' || !/^[A-Z0-9-]{4,32}$/.test(result.userCode)) throw new Error('OpenAI could not start device authorization. Try again.')
  const loginId = result.loginId
  attempt = { loginId, timer: setTimeout(() => {
    attempt = null
    void rpc.request('account/login/cancel', { loginId }).catch(() => {})
  }, 10 * 60000) }
  return { deviceCode: { verificationUrl: result.verificationUrl, userCode: result.userCode }, expiresAt: new Date(Date.now() + 10 * 60000).toISOString() }
}
export async function disconnectPersonalDevice(dataDir) {
  const rpc = await client(dataDir)
  if (attempt) { clearTimeout(attempt.timer); await rpc.request('account/login/cancel', { loginId: attempt.loginId }).catch(() => {}); attempt = null }
  await rpc.request('account/logout')
}
