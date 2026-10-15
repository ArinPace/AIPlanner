import { randomBytes, randomUUID } from 'node:crypto'
import { ApiError, body, db, json } from './cloud.js'
import { createPlannerMcp } from './mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { hostOnline, safeWorkerStatus, uuid, vmHash, vmMessage } from './vm-validation.js'
import { openVmCredential, sealVmCredential } from './vm-vault.js'
import { VM_SOURCES } from '../src/lib/vm.js'

function checked<T>({ data, error }: { data: T; error: { code?: string } | null }): NonNullable<T> {
  if (error) throw new ApiError(error.code === '23505' ? 409 : 503, error.code === '23505' ? 'Another message is already waiting in this chat.' : 'Could not access your agent workspace.')
  return data as NonNullable<T>
}
const publicJob = 'id,chat_id,kind,status,message,reply,error,created_at,started_at,finished_at,result'
const publicHost = 'id,label,heartbeat_at,capabilities,created_at'
// Explicit personal self-hosted account only. Do not turn this into a public
// hosted subscription flow without an approved OpenAI client integration.
const personalChatGptAllowed = (username: string) => (process.env.PLANNER_PERSONAL_CHATGPT_USERS || 'arin').split(',').map(x => x.trim()).includes(username)
export async function workerIdentity(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
  if (!/^pvm_[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, 'Worker authorization required.')
  const host = checked(await db().from('planner_vm_hosts').select('id,username,capabilities').eq('token_hash', vmHash(token)).is('revoked_at', null).maybeSingle())
  if (!host) throw new ApiError(401, 'Worker authorization expired. Pair the VM again.')
  return host
}
export async function handleVmWorker(request: Request, path: string) {
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.')
  if (path === '/api/agent/vm/worker/enroll') {
    const input = await body(request)
    const code = String(input.code || '')
    if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new ApiError(400, 'Invalid or expired pairing code.')
    const token = 'pvm_' + randomBytes(32).toString('base64url')
    const result = checked(await db().rpc('planner_vm_enroll', { p_code_hash: vmHash(code), p_token_hash: vmHash(token), p_label: 'Personal VM' }))
    if (!result) throw new ApiError(401, 'Pairing code expired or already used.')
    return json({ ...result, token }, 201)
  }
  const host = await workerIdentity(request)
  if (path === '/api/agent/vm/worker/config') {
    const settings = checked(await db().from('planner_vm_settings').select('*').eq('username', host.username).single())
    return json({ sources: settings.sources, credential: settings.credential ? openVmCredential(settings.credential) : null, personalChatGptAllowed: personalChatGptAllowed(host.username) })
  }
  if (path === '/api/agent/vm/worker/mcp') {
    const jobId = request.headers.get('x-planner-job'), lease = request.headers.get('x-planner-lease')
    if (!uuid(jobId) || !uuid(lease)) throw new ApiError(401, 'An active job lease is required.')
    const job = checked(await db().from('planner_vm_jobs').select('id').eq('id', jobId).eq('host_id', host.id).eq('username', host.username).eq('lease', lease).eq('status', 'running').gt('lease_until', new Date().toISOString()).maybeSingle())
    if (!job) throw new ApiError(409, 'The run was cancelled or expired.')
    const server = createPlannerMcp(host.username, ['planner:read', 'planner:write'])
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    try { return await transport.handleRequest(request) } finally { await server.close() }
  }
  const input = await body(request)
  if (path === '/api/agent/vm/worker/claim') {
    checked(await db().from('planner_vm_hosts').update({ heartbeat_at: new Date().toISOString(), capabilities: safeWorkerStatus(input) }).eq('id', host.id).is('revoked_at', null))
    const settings = checked(await db().from('planner_vm_settings').select('sources,schedule_enabled').eq('username', host.username).single())
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const part = (type: string) => parts.find(p => p.type === type)?.value || ''
    if (settings.schedule_enabled && settings.sources.length && ['07', '17'].includes(part('hour'))) {
      const slot = `${part('year')}-${part('month')}-${part('day')} ${part('hour')}`
      checked(await db().from('planner_vm_jobs').upsert({ username: host.username, host_id: host.id, kind: 'sync', schedule_slot: slot, message: 'Read my enabled websites for new announcements, assignments and deadline changes. Read the planner first, save verified updates with planner_apply_updates, and report which sources were checked or unavailable. Do not invent deadlines or overwrite manual edits.' }, { onConflict: 'username,schedule_slot', ignoreDuplicates: true }))
    }
    const job = checked(await db().rpc('planner_vm_claim', { p_host: host.id }))
    return json({ job: job || null })
  }
  if (path === '/api/agent/vm/worker/progress' || path === '/api/agent/vm/worker/finish') {
    if (!uuid(input.id) || !uuid(input.lease)) throw new ApiError(400, 'Invalid job lease.')
    const finished = path.endsWith('/finish')
    const reply = typeof input.reply === 'string' ? input.reply.slice(0, 80000) : ''
    const error = typeof input.error === 'string' ? input.error.slice(0, 1000) : null
    const threadId = uuid(input.threadId) ? input.threadId : null
    const output: Record<string, unknown> = {}
    if (input.result && typeof input.result === 'object') {
      const value = input.result as Record<string, unknown>
      if (typeof value.liveUrl === 'string' && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/[A-Za-z0-9_-]{32}\//.test(value.liveUrl) && value.liveUrl.length < 1000) {
        output.liveUrl = value.liveUrl; output.expiresAt = new Date(Date.now() + 20 * 60000).toISOString()
      }
      if (value.sites && typeof value.sites === 'object') output.sites = Object.fromEntries(Object.keys(VM_SOURCES).filter(k => k in (value.sites as object)).map(k => [k, { ready: (value.sites as Record<string, { ready?: boolean }>)[k]?.ready === true }]))
    }
    const result = checked(await db().rpc('planner_vm_report', { p_host: host.id, p_job: input.id, p_lease: input.lease, p_reply: reply, p_error: error, p_finished: finished, p_thread: threadId, p_result: output }))
    if (!result) throw new ApiError(409, 'This job was cancelled or its lease expired.')
    if (finished && !error && output.sites) checked(await db().from('planner_vm_jobs').update({ result: {} }).eq('username', host.username).eq('kind', 'browser_login').eq('status', 'completed'))
    return json({ ok: true })
  }
  throw new ApiError(404, 'Unknown worker action.')
}

export async function handleVmRequest(request: Request, path: string, username: string) {
  const url = new URL(request.url)
  if (request.method === 'GET' && path === '/api/agent/vm') {
    checked(await db().from('planner_vm_settings').upsert({ username }, { onConflict: 'username', ignoreDuplicates: true }))
    const [hosts, chats, settings, runs, provisioning] = await Promise.all([
      db().from('planner_vm_hosts').select(publicHost).eq('username', username).is('revoked_at', null).order('created_at', { ascending: false }),
      db().from('planner_vm_chats').select('id,title,created_at,updated_at').eq('username', username).order('updated_at', { ascending: false }).limit(100),
      db().from('planner_vm_settings').select('sources,schedule_enabled,sites,ai_provider').eq('username', username).single(),
      db().from('planner_vm_jobs').select(publicJob).eq('username', username).order('created_at', { ascending: false }).limit(20),
      db().from('planner_vm_provisioning').select('status,error').eq('username', username).maybeSingle(),
    ])
    return json({ hosts: checked(hosts).map(h => ({ ...h, online: hostOnline(h.heartbeat_at) })), chats: checked(chats), settings: checked(settings), runs: checked(runs), provisioning: checked(provisioning) || null, personalChatGptAvailable: personalChatGptAllowed(username), hostedChatGptAvailable: false, recordings: false })
  }
  if (request.method === 'GET' && path === '/api/agent/vm/messages') {
    const chatId = url.searchParams.get('chat')
    if (!uuid(chatId)) throw new ApiError(400, 'Choose a chat.')
    return json({ jobs: checked(await db().from('planner_vm_jobs').select(publicJob).eq('username', username).eq('chat_id', chatId).order('created_at', { ascending: false }).limit(100)).reverse() })
  }
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.')
  const input = await body(request)
  if (path === '/api/agent/vm/chatgpt/connect' || path === '/api/agent/vm/chatgpt/disconnect') {
    if (!personalChatGptAllowed(username)) throw new ApiError(403, 'Hosted ChatGPT subscription sign-in is awaiting provider approval. Use an API key instead.')
    const host = checked(await db().from('planner_vm_hosts').select('id,heartbeat_at').eq('username', username).is('revoked_at', null).maybeSingle())
    if (!host) throw new ApiError(409, 'Your personal VM is still being prepared.')
    if (path.endsWith('/connect')) checked(await db().from('planner_vm_settings').update({ credential: null, ai_provider: null }).eq('username', username))
    return json(checked(await db().from('planner_vm_jobs').insert({ username, host_id: host.id, kind: 'browser_login', message: path.endsWith('/disconnect') ? 'chatgpt_disconnect' : 'chatgpt_oauth' }).select(publicJob).single()), 202)
  }
  if (path === '/api/agent/vm/ai') {
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
    if (!/^sk-[A-Za-z0-9_-]{20,400}$/.test(apiKey)) throw new ApiError(400, 'Enter a valid OpenAI API key.')
    const verify = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) })
    if (!verify.ok) throw new ApiError(400, 'OpenAI could not verify this API key. Check its permissions and billing.')
    checked(await db().from('planner_vm_settings').upsert({ username, ai_provider: 'openai_api', credential: sealVmCredential({ apiKey }), updated_at: new Date().toISOString() }, { onConflict: 'username' }))
    return json({ ok: true })
  }
  if (path === '/api/agent/vm/ai/disconnect') {
    checked(await db().from('planner_vm_settings').update({ credential: null, ai_provider: null }).eq('username', username))
    return json({ ok: true })
  }
  if (path === '/api/agent/vm/settings') {
    if (!Array.isArray(input.sources) || input.sources.some(s => typeof s !== 'string' || !(s in VM_SOURCES)) || typeof input.schedule_enabled !== 'boolean') throw new ApiError(400, 'Choose supported websites.')
    if (input.schedule_enabled && !input.sources.length) throw new ApiError(400, 'Choose websites before enabling daily checks.')
    checked(await db().from('planner_vm_settings').upsert({ username, sources: [...new Set(input.sources)], schedule_enabled: input.schedule_enabled, updated_at: new Date().toISOString() }, { onConflict: 'username' }))
    if (input.schedule_enabled) checked(await db().from('planner_agent_settings').update({ schedule_enabled: false }).eq('username', username))
    return json({ ok: true })
  }
  if (path === '/api/agent/vm/browser/open' || path === '/api/agent/vm/browser/check') {
    const source = String(input.source || '')
    if (path.endsWith('/open') && !(source in VM_SOURCES)) throw new ApiError(400, 'Choose a website.')
    const host = checked(await db().from('planner_vm_hosts').select('id,heartbeat_at').eq('username', username).is('revoked_at', null).maybeSingle())
    if (!host) throw new ApiError(409, 'Your private computer is still being prepared.')
    if (source) {
      const settings = checked(await db().from('planner_vm_settings').select('sources').eq('username', username).single())
      if (!settings.sources.includes(source)) throw new ApiError(400, 'Select this website in setup first.')
    }
    const job = checked(await db().from('planner_vm_jobs').insert({ username, host_id: host.id, kind: path.endsWith('/open') ? 'browser_login' : 'browser_check', message: source }).select(publicJob).single())
    return json(job, 202)
  }
  if (path === '/api/agent/vm/pair') {
    const code = randomBytes(24).toString('base64url')
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString()
    checked(await db().from('planner_vm_pairings').delete().eq('username', username))
    checked(await db().from('planner_vm_pairings').insert({ code_hash: vmHash(code), username, expires_at: expiresAt }))
    return json({ code, expiresAt })
  }
  if (path === '/api/agent/vm/revoke') {
    if (!uuid(input.id)) throw new ApiError(400, 'Choose a VM.')
    checked(await db().from('planner_vm_hosts').update({ revoked_at: new Date().toISOString() }).eq('id', input.id).eq('username', username))
    checked(await db().from('planner_vm_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('username', username).eq('host_id', input.id).in('status', ['queued', 'running']))
    return json({ ok: true })
  }
  if (path === '/api/agent/vm/chats') {
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 100) : 'New conversation'
    return json(checked(await db().from('planner_vm_chats').insert({ username, title }).select('id,title,created_at,updated_at').single()), 201)
  }
  if (path === '/api/agent/vm/cancel') {
    if (!uuid(input.id)) throw new ApiError(400, 'Choose a run.')
    checked(await db().from('planner_vm_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', input.id).eq('username', username).in('status', ['queued', 'running']))
    return json({ ok: true })
  }
  if (path === '/api/agent/vm/send') {
    if (!uuid(input.chatId)) throw new ApiError(400, 'Choose a chat.')
    let message: string
    try { message = vmMessage(input.message) } catch (e) { throw new ApiError(400, (e as Error).message) }
    const chat = checked(await db().from('planner_vm_chats').select('id,thread_id').eq('id', input.chatId).eq('username', username).maybeSingle())
    if (!chat) throw new ApiError(404, 'Chat not found.')
    const host = checked(await db().from('planner_vm_hosts').select('id').eq('username', username).is('revoked_at', null).maybeSingle())
    if (!host) throw new ApiError(409, 'Pair your personal VM before sending a message.')
    const id = randomUUID()
    checked(await db().from('planner_vm_jobs').insert({ id, username, chat_id: chat.id, host_id: host.id, message, thread_id: chat.thread_id, kind: 'chat' }))
    checked(await db().from('planner_vm_chats').update({ updated_at: new Date().toISOString(), ...(String(input.title || '') ? { title: String(input.title).slice(0, 100) } : {}) }).eq('id', chat.id).eq('username', username))
    return json({ id, status: 'queued' }, 202)
  }
  throw new ApiError(404, 'Unknown VM action.')
}
