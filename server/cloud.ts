import {cloudFilesManifest,readFilesTransferItem} from './files-transfer.js'
import {applyFilesPatch,type FilesPatch} from '../src/lib/filesTransfer.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { FILES_WORKSPACE_MAX_BYTES, filesWorkspaceLimit, validateFilesState, type FilesState, type PlannerDocument } from '../src/lib/files.js'
import { createToken, normalizeUsername, tokenHash } from './auth.js'
import { handleAgentRequest } from './agent.js'
import { handleMcpRequest } from './mcp.js'
import { handleChatLinks } from './chat-links.js'
import { handleVmRequest, handleVmWorker } from './vm.js'
import {handlePlanning} from './planning.js'
import {readAgentInstructions,saveAgentInstructions} from './agent-instructions.js'
import {readNoteHistory} from './note-history.js'
import {calendarHistory,restoreCalendarEvent} from './calendar-history.js'
import {fixedSyncStatus,requestFixedSync} from './google-fixed-sync.js'
import {normalizeEventFolders,validateEventFolders} from '../src/lib/eventFolders.js'
import {z} from 'zod'
import { handleVmPool, registerVmHost, touchVmActivity } from './vm-host.js'
import { handleFilesBin, preserveRemovedFiles } from './files-bin.js'

const BUCKET = 'planner-pdfs'
let client: SupabaseClient | undefined
export function cloudConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY))
}
export function db() {
  if (!cloudConfigured()) throw new ApiError(503, 'Cloud storage is not configured yet.')
  client ??= createClient(process.env.SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
function result<T>({ data, error }: { data: T; error: { code?: string; message?: string } | null }): T {
  if (error) {
    console.error('Supabase operation failed', { code: error.code ?? 'storage_error' })
    throw new ApiError(503, 'Could not access cloud storage. Please try again.')
  }
  return data
}
function dataResult<T>(response: { data: T; error: { code?: string; message?: string } | null }): NonNullable<T> {
  const data = result(response)
  if (data === null || data === undefined) throw new ApiError(503, 'Cloud storage returned no data. Please try again.')
  return data as NonNullable<T>
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (Buffer.byteLength(text) > FILES_WORKSPACE_MAX_BYTES) throw new ApiError(413, 'This workspace is too large to save in one request.')
  try {
    const parsed: unknown = JSON.parse(text || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch { throw new ApiError(400, 'Invalid request data.') }
}
function bearer(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  return /^[0-9a-f]{48,64}$/.test(token) ? token : null
}
async function sessionUser(request: Request): Promise<string | null> {
  const token = bearer(request)
  if (!token) return null
  const session = result(await db().from('planner_sessions').select('username').eq('token_hash', tokenHash(token)).gt('expires_at', new Date().toISOString()).maybeSingle())
  return session?.username ?? null
}
export async function sessionToken(username: string) {
  const token = createToken()
  result(await db().from('planner_sessions').insert({ username, token_hash: tokenHash(token), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }))
  return token
}
async function filesFor(username: string): Promise<FilesState> {
  const row = dataResult(await db().from('planner_files').select('state,revision').eq('username', username).single())
  validateFilesState(row.state,filesWorkspaceLimit(username))
  return { ...row.state, revision: row.revision, storageLimitBytes:filesWorkspaceLimit(username) }
}
async function setFiles(username: string, next: FilesState, previous: FilesState): Promise<FilesState> {
  validateFilesState(next,filesWorkspaceLimit(username))
  const { revision: _revision, storageLimitBytes:_quota, ...state } = next
  const rows = dataResult(await db().from('planner_files').update({ state, revision: previous.revision! + 1, updated_at: new Date().toISOString() }).eq('username', username).eq('revision', previous.revision!).select('revision'))
  if (!rows.length) throw new ApiError(409, 'Files changed in another tab. Reload to see the latest version before saving again.')
  return { ...state, revision: rows[0].revision, storageLimitBytes:filesWorkspaceLimit(username) }
}
export async function cleanupUploads(username: string) {
  const uploads = dataResult(await db().from('planner_uploads').select('id,storage_path').eq('username', username).or(`status.eq.deleted,and(status.eq.pending,expires_at.lt.${new Date().toISOString()})`))
  if (!uploads.length) return
  const { error } = await db().storage.from(BUCKET).remove(uploads.map((upload) => upload.storage_path))
  if (error) { console.error('PDF cleanup will retry', { code: 'storage_cleanup' }); return }
  result(await db().from('planner_uploads').delete().eq('username', username).in('id', uploads.map((upload) => upload.id)))
}
async function ownedUpload(username: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(404, 'PDF not found.')
  const upload = result(await db().from('planner_uploads').select('*').eq('username', username).eq('id', id).maybeSingle())
  if (!upload) throw new ApiError(404, 'PDF not found.')
  return upload
}

export async function handleCloudRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.searchParams.get('route') ? `/api/${url.searchParams.get('route')}` : url.pathname.replace(/\/$/, '')
  const method = request.method
  try {
    if(path.startsWith('/api/auth/') || (path==='/api/agent/oauth/callback/google' && url.searchParams.get('state')?.startsWith('login_'))){
      const response=await (await import('./account-auth.js')).handleAccountAuth(request,path)
      if(response)return response
    }
    if (['/api/agent/vm/host/claim', '/api/agent/vm/host/finish', '/api/agent/vm/host/power', '/api/agent/vm/host/status'].includes(path)) return await handleVmPool(request, path)
    if (path.startsWith('/api/agent/vm/worker/')) return await handleVmWorker(request, path)
    if (path.startsWith('/api/mcp') || path.startsWith('/api/.well-known/')) return await handleMcpRequest(request, path)
    if (path === '/api/agent/cron' || path.startsWith('/api/agent/oauth/callback/')) {
      return await handleAgentRequest(request, path, null)
    }
    if (path === '/api/health' && method === 'GET') {
      result(await db().from('planner_accounts').select('username', { head: true, count: 'exact' }).limit(1))
      const bucket = dataResult(await db().storage.getBucket(BUCKET))
      if (bucket.public) throw new ApiError(503, 'PDF storage must be private.')
      return json({ ok: true, database: 'supabase', pdfStorage: 'private', maxPdfBytes: 25 * 1024 * 1024 })
    }
    if ((path === '/api/login' || path === '/api/register') && method === 'POST') {
      const input = await body(request)
      const {passwordAccount,createLoginAccount,normalizeEmail}=await import('./account-auth.js')
      const identifier=typeof input.username==='string'?input.username:''
      const password=typeof input.password==='string'?input.password:''
      if(password.length>256)throw new ApiError(400,'Enter a valid username or email and password.')
      if(path==='/api/register'){
        const username=normalizeUsername(identifier)
        const email=input.email===undefined?null:normalizeEmail(input.email)
        if(!username || (input.email!==undefined&&!email))throw new ApiError(400,'Enter a valid username and email.')
        if(password.length<8)throw new ApiError(400,'New passwords must be at least 8 characters.')
        await createLoginAccount(username,password,email)
        return json({username,token:await sessionToken(username)},201)
      }
      const account=await passwordAccount(identifier,password)
      if(!account)throw new ApiError(401,'Wrong email/username or password.')
      await touchVmActivity(account.username).catch(()=>console.error('VM wake request will retry from the signed-in app.'))
      return json({username:account.username,token:await sessionToken(account.username)})
    }

    if (path === '/api/session' && method === 'GET') return json({ username: await sessionUser(request) })
    if (path === '/api/logout' && method === 'POST') {
      const token = bearer(request)
      if (token) result(await db().from('planner_sessions').delete().eq('token_hash', tokenHash(token)))
      return json({ ok: true })
    }
    const username = await sessionUser(request)
    if (!username) throw new ApiError(401, 'Please sign in.')
    if (path === '/api/widget/feedback' || path === '/api/widget/snapshot') return await (await import('./widget-background.js')).handleWidgetBackground(request,path,username)
    if(path==='/api/subscription-chat')return await (await import('./subscription-chat.js')).handleSubscriptionChat(request,username)
    if(path==='/api/sources/status'&&method==='GET')return json(await (await import('./source-health.js')).sourceHealthStatus(username))
    if(path==='/api/notifications'&&['GET','PUT'].includes(method)){const {taskNotificationSettings}=await import('./task-notifications.js');return json(await taskNotificationSettings(username,method==='PUT'?await body(request):undefined))}
    if (path === '/api/planning') return await handlePlanning(request,username)
    if(path==='/api/agent/instructions'){
      if(method==='GET')return json(await readAgentInstructions(username))
      if(method==='POST')return json(await saveAgentInstructions(username,await body(request)))
      throw new ApiError(405,'Use GET or POST.')
    }
    if(path==='/api/files/history'&&method==='GET'){
      const params=new URL(request.url).searchParams,noteId=params.get('noteId')||''
      if(!noteId||noteId.length>200)throw new ApiError(400,'Choose a note.')
      const args:{noteId:string;before?:number;versionId?:number;offset?:number}={noteId}
      for(const key of ['before','versionId','offset'] as const)if(params.has(key)){const value=Number(params.get(key));if(!Number.isSafeInteger(value)||value<0)throw new ApiError(400,'Invalid history page.');args[key]=value}
      return json(await readNoteHistory(username,args))
    }
    if (path === '/api/agent/vm/host/register' && method === 'POST') return await registerVmHost(username)
    if (path === '/api/agent/vm' || path.startsWith('/api/agent/vm/')) return await handleVmRequest(request, path, username)
    if (path === '/api/agent/chats' || path === '/api/agent/chats/remove' || path === '/api/agent/mcp/disconnect') return await handleChatLinks(request, path, username)
    if (path.startsWith('/api/agent/')) return await handleAgentRequest(request, path, username)
    if(path==='/api/calendar/staging/prepare'&&method==='POST'){
      const input=z.object({refresh:z.boolean().optional()}).parse(await body(request))
      return json(await (await import('./calendar-staging.js')).prepareCalendarStage(username,input.refresh))
    }
    if(['/api/calendar/export.json','/api/calendar/staging.json'].includes(path)&&method==='GET'){
      const data=await (await import('./calendar-staging.js')).calendarDownload(username,path.endsWith('staging.json'))
      return new Response(JSON.stringify(data,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+(path.endsWith('staging.json')?'calendar-staging.json':'calendar.json')+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
    }
    if(path==='/api/calendar/google-sync'&&method==='GET')return json(await fixedSyncStatus(username))
    if(path==='/api/calendar/google-sync'&&method==='POST'){await requestFixedSync(username);return json(await fixedSyncStatus(username))}
    if(path==='/api/calendar/history'&&method==='GET'){
      const query=new URL(request.url).searchParams
      const args=z.object({before:z.coerce.number().int().positive().optional(),versionId:z.coerce.number().int().positive().optional(),eventId:z.string().max(200).optional(),calendarKey:z.string().max(300).optional()}).parse(Object.fromEntries(query))
      return json(await calendarHistory(username,args))
    }
    if(path==='/api/calendar/restore'&&method==='POST')return json(await restoreCalendarEvent(username,z.object({versionId:z.number().int().positive(),revision:z.number().int().nonnegative(),side:z.enum(['before','after']),overwrite:z.boolean().optional()}).parse(await body(request))))
    if (path === '/api/calendar' && method === 'GET') {
      const row = dataResult(await db().from('planner_calendars').select('state,revision').eq('username', username).single())
      return json({ ...row.state,events:normalizeEventFolders(row.state.events), revision: row.revision })
    }
    if (['/api/files/bin','/api/files/trash','/api/files/restore','/api/files/purge'].includes(path))return await handleFilesBin(request,path,username)
    if (path === '/api/calendar' && method === 'PUT') {
      const input = await body(request)
      if (!Array.isArray(input.events) || !Array.isArray(input.tags) || !Array.isArray(input.hiddenTagIds)) throw new ApiError(400, 'Invalid calendar data.')
      const state = { events: input.events, tags: input.tags, hiddenTagIds: input.hiddenTagIds, zoom: typeof input.zoom === 'number' ? input.zoom : 1 }
      state.events=normalizeEventFolders(state.events)
      validateEventFolders(state.events)
      if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new ApiError(409, 'Reload your calendar before saving.')
      const rows = dataResult(await db().from('planner_calendars').update({ state, revision: Number(input.revision) + 1, updated_at: new Date().toISOString() }).eq('username', username).eq('revision', input.revision).select('revision'))
      if (!rows.length) throw new ApiError(409, 'Your calendar changed during a sync or in another tab. Reload before saving.')
      return json({ ok: true, revision: rows[0].revision })
    }
    if(path==='/api/files/item'&&method==='GET')return json(await readFilesTransferItem(username,url))
    if (path === '/api/files' && method === 'GET') {
      const ensured=await db().rpc('planner_ensure_planning_notes',{p_username:username})
      if(ensured.error)throw new ApiError(503,'Could not prepare your planning notes.')
      await cleanupUploads(username)
      if(url.searchParams.has('manifest'))return json(await cloudFilesManifest(username))
      return json(await filesFor(username))
    }
    if (path === '/api/files' && (method === 'PUT'||method === 'PATCH')) {
      const payload = await body(request)
      const previous = await filesFor(username)
      if(payload.revision!==previous.revision)throw new ApiError(409,'Files changed in another tab. Reload before saving again.')
      const input=method==='PATCH'?applyFilesPatch(previous,payload as FilesPatch):payload
      validateFilesState(input,filesWorkspaceLimit(username))
      if (input.revision !== previous.revision) throw new ApiError(409, 'Files changed in another tab. Reload before saving again.')
      const pdfs = (input.documents ?? []).filter((document) => document.kind === 'pdf')
      if (pdfs.length) {
        const uploads = dataResult(await db().from('planner_uploads').select('id,size,status').eq('username', username).in('id', pdfs.map((pdf) => pdf.id)))
        if (pdfs.some((pdf) => !uploads.some((upload) => upload.id === pdf.id && upload.status === 'complete' && upload.size === pdf.size))) throw new ApiError(400, 'A PDF is not available in this account. Reload your files.')
      }
      const saved = await preserveRemovedFiles(username,input,previous) || await setFiles(username, input, previous)
      await cleanupUploads(username)
      let planningSyncError:string|undefined
      try{await (await import('./planning.js')).syncTodoCompletion(username)}catch{planningSyncError='Note saved; calendar completion sync is pending. Open Agent to retry.'}
      return json({ ok: true, revision: saved.revision, planningSyncError })
    }
    if (['/api/files/upload/start','/api/files/upload/finish'].includes(path) && method==='POST')return handlePdfUpload(request,path,username)
    if (path === '/api/files/upload/cancel' && method === 'POST') {
      const input = await body(request)
      const upload = await ownedUpload(username, String(input.id ?? ''))
      if (upload.status === 'pending') {
        result(await db().from('planner_uploads').update({ status: 'deleted' }).eq('username', username).eq('id', upload.id))
        await cleanupUploads(username)
      }
      return json({ ok: true })
    }
    if (path.startsWith('/api/files/documents/') && method === 'GET') {
      const id = path.slice('/api/files/documents/'.length)
      const state = await filesFor(username)
      const document = state.documents?.find((item) => item.id === id && item.kind === 'pdf')
      if (!document) throw new ApiError(404, 'PDF not found.')
      const upload = await ownedUpload(username, id)
      if (upload.status !== 'complete') throw new ApiError(404, 'PDF not found.')
      const signed = dataResult(await db().storage.from(BUCKET).createSignedUrl(upload.storage_path, 60, { download: document.name }))
      return json({ downloadUrl: signed.signedUrl })
    }
    throw new ApiError(404, 'Not found.')
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status)
    if (error instanceof Error && error.name==='ZodError') return json({error:'Invalid values. Check dates, times, intensity and required fields.'},400)
    if (error instanceof Error && /Names must|already exists|folder|file|note|document|link|label|color|Invalid|Too many|workspace/i.test(error.message)) return json({ error: error.message }, 400)
    console.error('Planner API failed', { path, method, type: error instanceof Error ? error.name : 'unknown' })
    return json({ error: 'Could not complete this request. Please try again.' }, 500)
  }
}

export async function handlePdfUpload(request:Request,path:string,username:string){
    if (path === '/api/files/upload/start') {
      const input = await body(request)
      const state = await filesFor(username)
      const id = randomUUID()
      const document: PlannerDocument = { id, folderId: input.folderId === null ? null : String(input.folderId ?? ''), name: String(input.name ?? '').trim(), kind: 'pdf', size: Number(input.size), updatedAt: new Date().toISOString() }
      if (!document.name.toLowerCase().endsWith('.pdf')) throw new ApiError(400, 'Choose a PDF file.')
      validateFilesState({ ...state, documents: [...(state.documents ?? []), document] },filesWorkspaceLimit(username))
      const storagePath = `${username}/${id}.pdf`
      const signed = dataResult(await db().storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false }))
      result(await db().from('planner_uploads').insert({ id, username, folder_id: document.folderId, name: document.name, size: document.size, storage_path: storagePath }))
      return json({ mode: 'signed', id, uploadUrl: signed.signedUrl })
    }
    if (path === '/api/files/upload/finish') {
      const input = await body(request)
      const upload = await ownedUpload(username, String(input.id ?? ''))
      const state = await filesFor(username)
      if (upload.status === 'complete' && state.documents?.some((document) => document.id === upload.id)) return json(new URL(request.url).searchParams.has('summary')?{ok:true,revision:state.revision}:state)
      if (upload.status !== 'pending' || Date.parse(upload.expires_at) < Date.now()) throw new ApiError(410, 'Upload expired. Upload your PDF again.')
      const info = dataResult(await db().storage.from(BUCKET).info(upload.storage_path))
      if (info.size !== upload.size) throw new ApiError(400, 'Uploaded PDF size does not match. Please upload again.')
      const signed = dataResult(await db().storage.from(BUCKET).createSignedUrl(upload.storage_path, 60))
      const response = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-1023' } })
      if (!response.ok) throw new ApiError(503, 'Could not verify the uploaded PDF.')
      const reader = response.body?.getReader()
      const first = await reader?.read()
      await reader?.cancel()
      if (!first?.value || !Buffer.from(first.value).subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new ApiError(400, 'Uploaded file is not a valid PDF.')
      const document: PlannerDocument = { id: upload.id, folderId: upload.folder_id, name: upload.name, size: upload.size, kind: 'pdf', updatedAt: new Date().toISOString() }
      const next = { ...state, documents: [...(state.documents ?? []).filter((item) => item.id !== upload.id), document] }
      validateFilesState(next,filesWorkspaceLimit(username))
      result(await db().from('planner_uploads').update({ status: 'complete' }).eq('username', username).eq('id', upload.id))
      try { const saved=await setFiles(username,next,state);return json(new URL(request.url).searchParams.has('summary')?{ok:true,revision:saved.revision}:saved) }
      catch (error) { await db().from('planner_uploads').update({ status: 'pending' }).eq('username', username).eq('id', upload.id); throw error }
    }
 throw new ApiError(404,'Unknown PDF upload action.')
}
