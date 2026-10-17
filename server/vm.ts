import { randomBytes, randomUUID } from 'node:crypto'
import { ApiError, body, db, json } from './cloud.js'
import { createPlannerMcp } from './mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { hostOnline, safeWorkerStatus, safeDeviceAuthorization, uuid, vmHash, vmMessage } from './vm-validation.js'
import { openVmCredential, sealVmCredential } from './vm-vault.js'
import { DEFAULT_VM_SCHEDULE, scheduleSlot, validateSchedule, scheduledReviewMessage } from './vm-power.js'
import { touchVmActivity } from './vm-host.js'
import { VM_SOURCES } from '../src/lib/vm.js'
import { googleCalendarStatus, readGoogleCalendar, startGoogleCalendar, selectGoogleAccount, removeGoogleAccount } from './agent.js'
import { observeAccounts, editBrowserAccount } from './browser-accounts.js'
import { bulkManageChats } from './vm-chats.js'

function checked<T>({ data, error }: { data: T; error: { code?: string } | null }): NonNullable<T> {
  if (error) throw new ApiError(error.code === '23505' ? 409 : 503, error.code === '23505' ? 'Another message is already waiting in this chat.' : 'Could not access your agent workspace.')
  return data as NonNullable<T>
}
const publicJob = 'id,chat_id,kind,status,message,reply,error,created_at,started_at,finished_at,result'
const publicHost = 'id,label,heartbeat_at,capabilities,created_at'
async function confirmBrowserConnection(username:string,source:string){
  checked(await db().from('planner_vm_jobs').update({result:{connected:true,source,connectedAt:new Date().toISOString()}}).eq('username',username).eq('kind','browser_login').eq('status','completed').in('message',[source,'open:'+source,'manage:'+source]).not('result->liveUrl','is',null))
}
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
    return json({ sources: settings.sources, aiProvider: settings.ai_provider, credential: settings.credential ? openVmCredential(settings.credential) : null, personalChatGptAllowed: personalChatGptAllowed(host.username) })
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
    const capabilities = safeWorkerStatus(input)
    if (capabilities.workerStartedAt && capabilities.workerStartedAt !== host.capabilities?.workerStartedAt) {
      checked(await db().from('planner_vm_jobs').update({ result: { interrupted: true } }).eq('username', host.username).eq('host_id', host.id).eq('kind','browser_login').eq('status','completed').lt('finished_at',capabilities.workerStartedAt).not('result->liveUrl','is',null))
    }
    if (input.activateClaude === true && input.claudeConnected === true) checked(await db().from('planner_vm_settings').update({ ai_provider: 'claude_code', credential: null }).eq('username', host.username))
    checked(await db().from('planner_vm_hosts').update({ heartbeat_at: new Date().toISOString(), capabilities }).eq('id', host.id).is('revoked_at', null))
    // Once authorized, remove the spent device code and its keep-awake window.
    // The user must retain no live sign-in secret just to keep chatting.
    if (input.signedIn === true) checked(await db().from('planner_vm_jobs').update({ result: {} }).eq('username', host.username).eq('kind', 'browser_login').eq('message', 'chatgpt_device').eq('status', 'completed').not('result->deviceCode', 'is', null))
    const settings = checked(await db().from('planner_vm_settings').select('sources,sites,schedule_enabled,schedule').eq('username', host.username).single())
    if (input.observedSites && typeof input.observedSites === 'object') {
      const observed = input.observedSites as Record<string, { ready?: boolean; identity?: unknown; completedConnection?: boolean }>
      await observeAccounts(host.username, observed, settings.sources)
      const verified = Object.fromEntries(Object.keys(VM_SOURCES).filter(k => settings.sources.includes(k) && observed[k]?.ready === true).map(k => [k, { ready: true, verifiedAt: new Date().toISOString() }]))
      if (Object.keys(verified).length) {
        checked(await db().from('planner_vm_settings').update({ sites: { ...settings.sites, ...verified } }).eq('username', host.username))
        // Expired connection views must not continue holding the VM awake.
        for (const source of Object.keys(verified)) if(observed[source].completedConnection===true)await confirmBrowserConnection(host.username,source)
      }
    }
    const slot = scheduleSlot(new Date(), settings.schedule || DEFAULT_VM_SCHEDULE, false)
    if (settings.schedule_enabled && settings.sources.length && slot) {
      checked(await db().from('planner_vm_jobs').upsert({ username: host.username, host_id: host.id, kind: 'sync', schedule_slot: slot, message: scheduledReviewMessage(settings.schedule || DEFAULT_VM_SCHEDULE) }, { onConflict: 'username,schedule_slot', ignoreDuplicates: true }))
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
        output.signInRequired=value.signInRequired===true
      }
      if (value.sites && typeof value.sites === 'object') output.sites = Object.fromEntries(Object.keys(VM_SOURCES).filter(k => k in (value.sites as object)).map(k => [k, { ready: (value.sites as Record<string, { ready?: boolean }>)[k]?.ready === true }]))
      const device = safeDeviceAuthorization(value.deviceCode, personalChatGptAllowed(host.username))
      if (device) { output.deviceCode = device; output.expiresAt = new Date(Date.now() + 10 * 60000).toISOString() }
    }
    const result = checked(await db().rpc('planner_vm_report', { p_host: host.id, p_job: input.id, p_lease: input.lease, p_reply: reply, p_error: error, p_finished: finished, p_thread: threadId, p_result: output }))
    if (!result) throw new ApiError(409, 'This job was cancelled or its lease expired.')
    if (finished && !error && input.result && typeof input.result === 'object' && 'sites' in input.result) {
      const settings = checked(await db().from('planner_vm_settings').select('sources').eq('username',host.username).single())
      await observeAccounts(host.username, (input.result as { sites: Record<string,{ready?:boolean;identity?:unknown}> }).sites, settings.sources)
    }
    if (finished && !error && output.sites) for(const [source,site] of Object.entries(output.sites as Record<string,{ready:boolean}>))if(site.ready)await confirmBrowserConnection(host.username,source)
    return json({ ok: true })
  }
  throw new ApiError(404, 'Unknown worker action.')
}

export async function handleVmRequest(request: Request, path: string, username: string) {
  const url = new URL(request.url)
  if (request.method === 'GET' && path === '/api/agent/vm') {
    checked(await db().from('planner_vm_settings').upsert({ username }, { onConflict: 'username', ignoreDuplicates: true }))
    const [hosts, chats, settings, runs, provisioning, accounts, deletedChats] = await Promise.all([
      db().from('planner_vm_hosts').select(publicHost).eq('username', username).is('revoked_at', null).order('created_at', { ascending: false }),
      db().from('planner_vm_chats').select('id,title,archived,created_at,updated_at').eq('username', username).is('deleted_at',null).order('updated_at', { ascending: false }).limit(100),
      db().from('planner_vm_settings').select('sources,schedule_enabled,sites,ai_provider,schedule').eq('username', username).single(),
      db().from('planner_vm_jobs').select(publicJob).eq('username', username).order('created_at', { ascending: false }).limit(20),
      db().from('planner_vm_provisioning').select('status,error,wake_until,power_state,power_updated_at').eq('username', username).maybeSingle(),
      db().from('planner_browser_accounts').select('id,source,identity,label,active,verified_at').eq('username',username).order('verified_at',{ascending:false}),
      db().from('planner_vm_chats').select('id,title,archived,created_at,updated_at,deleted_at').eq('username',username).not('deleted_at','is',null).gt('deleted_at',new Date(Date.now()-30*86400000).toISOString()).order('deleted_at',{ascending:false}).limit(1000),
    ])
    const machine = checked(provisioning) || null
    const connectedHosts = checked(hosts).map(h => ({ ...h, online: hostOnline(h.heartbeat_at) }))
    const wantsWake = Date.parse(machine?.wake_until || '') > Date.now() || checked(runs).some(r => ['queued','running'].includes(r.status))
    const freshPower = Date.now() - Date.parse(machine?.power_updated_at || '') < 60000
    const power = !connectedHosts.length ? 'preparing' : freshPower ? machine?.power_state === 'Running' ? 'online' : wantsWake ? 'starting' : 'offline' : connectedHosts.some(h => h.online) ? 'online' : wantsWake ? 'starting' : 'offline'
    const bin=checked(deletedChats),removed=new Set(bin.map(c=>c.id))
    return json({ hosts: connectedHosts, power, accounts:checked(accounts), google:await googleCalendarStatus(username), chats: checked(chats), deletedChats:bin, settings: checked(settings), runs: checked(runs).filter(r=>!removed.has(r.chat_id)), provisioning: machine, personalChatGptAvailable: personalChatGptAllowed(username), hostedChatGptAvailable: false, recordings: false })
  }
  if (request.method === 'GET' && path === '/api/agent/vm/messages') {
    const chatId = url.searchParams.get('chat')
    if (!uuid(chatId)) throw new ApiError(400, 'Choose a chat.')
    const owned=checked(await db().from('planner_vm_chats').select('id').eq('username',username).eq('id',chatId).is('deleted_at',null).maybeSingle())
    if(!owned)throw new ApiError(404,'Chat not found. Restore deleted chats from the Bin first.')
    return json({ jobs: checked(await db().from('planner_vm_jobs').select(publicJob).eq('username', username).eq('chat_id', chatId).order('created_at', { ascending: false }).limit(100)).reverse() })
  }
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.')
  const input = await body(request)
  if (path === '/api/agent/vm/google/connect') return startGoogleCalendar(username)
  if (path === '/api/agent/vm/browser/accounts') {
    if (!uuid(input.id)) throw new ApiError(400,'Choose an account.')
    await editBrowserAccount(username,input)
    return json({ok:true})
  }
  if (path === '/api/agent/vm/google/check') {
    if (input.id !== undefined && !uuid(input.id)) throw new ApiError(400,'Choose a Google account.')
    return json(await readGoogleCalendar(username,undefined,undefined,input.id as string | undefined))
  }
  if (path === '/api/agent/vm/google/disconnect') {
    if(!uuid(input.id))throw new ApiError(400,'Choose a Google account.')
    await removeGoogleAccount(username,input.id)
    return json({ok:true})
  }
  if(path==='/api/agent/vm/google/select') {if(!uuid(input.id))throw new ApiError(400,'Choose a Google account.');await selectGoogleAccount(username,input.id);return json({ok:true})}
  if (path === '/api/agent/vm/activity') return json({ wakeUntil: await touchVmActivity(username) })
  if (path === '/api/agent/vm/provider') {
    if (!['chatgpt', 'claude_code'].includes(String(input.provider))) throw new ApiError(400, 'Choose a connected AI.')
    if (input.provider === 'chatgpt' && !personalChatGptAllowed(username)) throw new ApiError(403, 'Personal ChatGPT is not available for this account.')
    const host = checked(await db().from('planner_vm_hosts').select('capabilities').eq('username', username).is('revoked_at', null).maybeSingle())
    const caps = host?.capabilities || {}
    const connected = input.provider === 'chatgpt' ? caps.chatgptConnected === true || (caps.signedIn === true && caps.runtime !== 'claude' && caps.identity !== 'OpenAI API') : caps.claudeConnected === true || (caps.signedIn === true && caps.runtime === 'claude')
    if (!connected) throw new ApiError(409, 'Connect this AI before selecting it.')
    checked(await db().from('planner_vm_settings').update({ ai_provider: input.provider === 'chatgpt' ? null : 'claude_code', credential: null }).eq('username', username))
    return json({ ok: true })
  }
  if (path === '/api/agent/vm/claude/connect' || path === '/api/agent/vm/claude/disconnect') {
    const host = checked(await db().from('planner_vm_hosts').select('id').eq('username', username).is('revoked_at', null).maybeSingle())
    if (!host) throw new ApiError(409, 'Your private computer is still being prepared.')
    if (path.endsWith('/disconnect')) checked(await db().from('planner_vm_settings').update({ ai_provider: null }).eq('username', username).eq('ai_provider', 'claude_code'))
    return json(checked(await db().from('planner_vm_jobs').insert({ username, host_id: host.id, kind: 'browser_login', message: path.endsWith('/connect') ? 'claude_connect' : 'claude_disconnect' }).select(publicJob).single()), 202)
  }
  if (path === '/api/agent/vm/chatgpt/connect' || path === '/api/agent/vm/chatgpt/disconnect') {
    if (!personalChatGptAllowed(username)) throw new ApiError(403, 'Hosted ChatGPT subscription sign-in is awaiting provider approval. Use an API key instead.')
    const host = checked(await db().from('planner_vm_hosts').select('id,heartbeat_at').eq('username', username).is('revoked_at', null).maybeSingle())
    if (!host) throw new ApiError(409, 'Your personal VM is still being prepared.')
    if (path.endsWith('/connect')) checked(await db().from('planner_vm_settings').update({ credential: null, ai_provider: null }).eq('username', username))
    checked(await db().from('planner_vm_jobs').update({ result: {} }).eq('username', username).eq('kind', 'browser_login').eq('status', 'completed'))
    return json(checked(await db().from('planner_vm_jobs').insert({ username, host_id: host.id, kind: 'browser_login', message: path.endsWith('/disconnect') ? 'chatgpt_disconnect' : input.method === 'oauth' ? 'chatgpt_oauth' : 'chatgpt_device' }).select(publicJob).single()), 202)
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
    let schedule
    try { schedule = input.schedule === undefined ? undefined : validateSchedule(input.schedule) } catch (e) { throw new ApiError(400, (e as Error).message) }
    checked(await db().from('planner_vm_settings').upsert({ username, ...(schedule ? { schedule } : {}), sources: [...new Set(input.sources)], schedule_enabled: input.schedule_enabled, updated_at: new Date().toISOString() }, { onConflict: 'username' }))
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
    const job = checked(await db().from('planner_vm_jobs').insert({ username, host_id: host.id, kind: path.endsWith('/open') ? 'browser_login' : 'browser_check', message: input.intent === 'open' ? 'open:' + source : input.intent==='manage' ? 'manage:'+source : source }).select(publicJob).single())
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
  if (path === '/api/agent/vm/chats/bulk') return json(await bulkManageChats(username,input))
  if (path === '/api/agent/vm/chats/rename') {
    if(!uuid(input.id) || typeof input.title!=='string' || !input.title.trim() || input.title.trim().length>100)throw new ApiError(400,'Use a chat name between 1 and 100 characters.')
    const rows=checked(await db().from('planner_vm_chats').update({title:input.title.trim(),updated_at:new Date().toISOString()}).eq('username',username).eq('id',input.id).is('deleted_at',null).select('id,title'))
    if(!rows.length)throw new ApiError(404,'Chat not found. Restore it from the Bin before renaming.')
    return json({ok:true,chat:rows[0]})
  }
  if (path === '/api/agent/vm/chats/archive' || path === '/api/agent/vm/chats/delete') {
    if (!uuid(input.id)) throw new ApiError(400,'Choose a chat.')
    if(path.endsWith('/archive') && typeof input.archived!=='boolean')throw new ApiError(400,'Choose archive or restore.')
    return json(await bulkManageChats(username,{ids:[input.id],action:path.endsWith('/delete')?'delete':input.archived?'archive':'restore'}))
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
    const chat = checked(await db().from('planner_vm_chats').select('id,thread_id,archived').eq('id', input.chatId).eq('username', username).is('deleted_at',null).maybeSingle())
    if (!chat) throw new ApiError(404, 'Chat not found.')
    if (chat.archived) throw new ApiError(409,'Restore this archived chat before sending a message.')
    const host = checked(await db().from('planner_vm_hosts').select('id').eq('username', username).is('revoked_at', null).maybeSingle())
    if (!host) throw new ApiError(409, 'Pair your personal VM before sending a message.')
    const id = randomUUID()
    checked(await db().from('planner_vm_jobs').insert({ id, username, chat_id: chat.id, host_id: host.id, message, thread_id: chat.thread_id, kind: 'chat' }))
    checked(await db().from('planner_vm_chats').update({ updated_at: new Date().toISOString(), ...(String(input.title || '') ? { title: String(input.title).slice(0, 100) } : {}) }).eq('id', chat.id).eq('username', username))
    return json({ id, status: 'queued' }, 202)
  }
  throw new ApiError(404, 'Unknown VM action.')
}
