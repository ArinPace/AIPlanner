// Native Claude Code owns authentication and token refresh. No token extraction.
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { openView } from './browser.mjs'
import { whatsappPermissionText } from './whatsapp-permission.mjs'
import { browserRuntimeEnv } from './browser-runtime-env.mjs'
import {plannerGuidance} from './planner-guidance.mjs'
import {claudeAttachmentInput} from './chat-attachments.mjs'
import { messagePermissionText } from './message-permission.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const executable = path.join(root, 'node_modules/.bin/claude')
let login
const environment = dataDir => {
  const env = { ...process.env, HOME: dataDir, CLAUDE_CONFIG_DIR: path.join(dataDir, '.claude'), BROWSER: 'true' }
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) delete env[key]
  return env
}
function run(dataDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment(dataDir), stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Claude Code did not respond.')) }, 20000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-20000) })
    child.on('error', () => { clearTimeout(timer); reject(new Error('Claude Code is unavailable on this VM.')) })
    child.on('exit', code => { clearTimeout(timer); resolve({ code, output }) })
  })
}
export async function claudeStatus(dataDir) {
  const result = await run(dataDir, ['auth', 'status'])
  if (result.code !== 0) return null
  const status = JSON.parse(result.output)
  return status.loggedIn ? { type: 'claude', identity: status.email || 'Claude Code' } : null
}
export async function disconnectClaude(dataDir) {
  if (login) { login.kill(); login = null }
  await run(dataDir, ['auth', 'logout'])
}
export async function connectClaude(dataDir) {
  if (login) login.kill()
  await mkdir(path.join(dataDir, '.claude'), { recursive: true, mode: 0o700 })
  const child = spawn(executable, ['auth', 'login', '--claudeai'], { env: environment(dataDir), stdio: ['ignore', 'pipe', 'pipe'] })
  login = child
  const timer = setTimeout(() => child.kill(), 10 * 60000)
  child.on('exit', () => { clearTimeout(timer); if (login === child) login = null })
  const destination = await new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Claude could not start sign-in.')) }, 30000)
    const capture = chunk => {
      buffer = (buffer + chunk).slice(-16000)
      const match = buffer.match(/https:\/\/(?:(?:claude\.ai|console\.anthropic\.com)\/oauth|claude\.com\/cai\/oauth)\/authorize\?\S+/)
      if (match) { clearTimeout(timeout); resolve(match[0]) }
    }
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Claude Code is unavailable on this VM.')) })
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Claude sign-in ended before authorization.')) })
  })
  return openView(dataDir, destination)
}
export async function claudeChat({ dataDir, job, remote, origin, token, instructions, progress }) {
  instructions += '\n\n'+plannerGuidance
  instructions += '\n\n' + whatsappPermissionText(remote.whatsappReadConsentAt)
  instructions += '\n\n' + messagePermissionText(remote.messageReadConsent)
  const sessionPath = path.join(dataDir, 'claude-sessions.json')
  let sessions = {}; try { sessions = JSON.parse(await readFile(sessionPath, 'utf8')) } catch {}
  const key = job.chat_id || job.id, existing = sessions[key]
  const sessionId = existing || randomUUID()
  const mcp = { mcpServers: {
    planner: { type: 'http', url: new URL('/api/agent/vm/worker/mcp', origin).href, headers: { Authorization: 'Bearer ' + token, 'X-Planner-Job': job.id, 'X-Planner-Lease': job.lease } },
    browser: { command: process.execPath, args: [path.join(root, 'browser-tools.mjs')], env: { ...browserRuntimeEnv(dataDir), PLANNER_ENABLED_SOURCES: JSON.stringify(remote.sources), PLANNER_ORIGIN: origin.href, PLANNER_WORKER_TOKEN: token } },
  } }
  // Lease headers are transient and never written into the native credential store.
  const args = ['-p', '--input-format','stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp), '--tools', '', '--allowedTools', 'mcp__planner__*', 'mcp__browser__*', '--disallowedTools', 'mcp__planner__browser_open', 'mcp__planner__browser_read', 'mcp__planner__browser_close', 'mcp__planner__google_calendar_accounts', 'mcp__planner__google_calendar_read', '--append-system-prompt', instructions, ...(existing ? ['--resume', sessionId] : ['--session-id', sessionId])]
  const child = spawn(executable, args, { env: environment(dataDir), cwd: path.join(dataDir, 'workspace'), stdio: ['pipe', 'pipe', 'ignore'] })
  let reply = '', buffer = '', result
  const timer = setTimeout(() => child.kill(), 15 * 60000)
  const heartbeat = setInterval(() => void progress(reply).catch(() => child.kill()), 20000)
  try {
    await new Promise((resolve, reject) => {
      child.on('error', () => reject(new Error('Claude Code is unavailable on this VM.')))
      child.stdout.on('data', chunk => {
        buffer += chunk
        for (;;) {
          const newline = buffer.indexOf('\n'); if (newline < 0) break
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
          try {
            const event = JSON.parse(line)
            if (event.type === 'stream_event' && event.event?.delta?.type === 'text_delta') reply = (reply + event.event.delta.text).slice(0, 80000)
            if (event.type === 'result') { result = event; if (typeof event.result === 'string') reply = event.result.slice(0, 80000) }
          } catch { /* Native diagnostics are not relayed to users. */ }
        }
      })
      child.on('exit', code => code === 0 && result && !result.is_error ? resolve() : reject(new Error('Claude could not complete this run. Check its connection and subscription limits.')))
      child.stdin.end(JSON.stringify({type:'user',message:{role:'user',content:claudeAttachmentInput(`Enabled websites: ${JSON.stringify(remote.sources)}.\n\n${job.message}`,job.attachment_payload)}})+'\n')
    })
    sessions[key] = sessionId
    await writeFile(sessionPath, JSON.stringify(sessions), { mode: 0o600 })
    return { reply, threadId: job.thread_id }
  } finally { clearTimeout(timer); clearInterval(heartbeat); child.kill() }
}
