import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { validateFilesState, type FilesState, type PlannerDocument } from '../src/lib/files.js'
import { createToken, hashPassword, normalizeUsername, tokenHash, verifyPassword } from './auth.js'
import { DEFAULT_CALENDAR, EMPTY_FILES } from './defaults.js'
import { handleAgentRequest } from './agent.js'
import { handleMcpRequest } from './mcp.js'
import { handleChatLinks } from './chat-links.js'
import { handleVmRequest, handleVmWorker } from './vm.js'
import { handleVmPool, queuePersonalVm, registerVmHost, touchVmActivity } from './vm-host.js'
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
  if (Buffer.byteLength(text) > 3 * 1024 * 1024) throw new ApiError(413, 'This workspace is too large to save in one request.')
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
async function sessionToken(username: string) {
  const token = createToken()
  result(await db().from('planner_sessions').insert({ username, token_hash: tokenHash(token), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }))
  return token
}
async function filesFor(username: string): Promise<FilesState> {
  const row = dataResult(await db().from('planner_files').select('state,revision').eq('username', username).single())
  validateFilesState(row.state)
  return { ...row.state, revision: row.revision }
}
async function setFiles(username: string, next: FilesState, previous: FilesState): Promise<FilesState> {
  const { revision: _revision, ...state } = next
  const rows = dataResult(await db().from('planner_files').update({ state, revision: previous.revision! + 1, updated_at: new Date().toISOString() }).eq('username', username).eq('revision', previous.revision!).select('revision'))
  if (!rows.length) throw new ApiError(409, 'Files changed in another tab. Reload to see the latest version before saving again.')
  return { ...state, revision: rows[0].revision }
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
      const username = typeof input.username === 'string' ? normalizeUsername(input.username) : null
      const password = typeof input.password === 'string' ? input.password : ''
      if (!username || password.length > 256) throw new ApiError(400, 'Enter a valid username and password.')
      if (path === '/api/register') {
        if (password.length < 8) throw new ApiError(400, 'New passwords must be at least 8 characters.')
        const { error } = await db().from('planner_accounts').insert({ username, password_hash: hashPassword(password) })
        if (error?.code === '23505') throw new ApiError(409, 'That username is already taken.')
        result({ data: null, error })
        try {
          result(await db().from('planner_calendars').insert({ username, state: DEFAULT_CALENDAR }))
          result(await db().from('planner_files').insert({ username, state: EMPTY_FILES }))
          await queuePersonalVm(username)
          await touchVmActivity(username)
          return json({ username, token: await sessionToken(username) }, 201)
        } catch (error) {
          await db().from('planner_accounts').delete().eq('username', username)
          throw error
        }
      }
      const account = result(await db().from('planner_accounts').select('password_hash').eq('username', username).maybeSingle())
      if (!account || !verifyPassword(password, account.password_hash)) throw new ApiError(401, 'Wrong username or password.')
      await touchVmActivity(username).catch(() => console.error('VM wake request will retry from the signed-in app.'))
      return json({ username, token: await sessionToken(username) })
    }
    if (path === '/api/session' && method === 'GET') return json({ username: await sessionUser(request) })
    if (path === '/api/logout' && method === 'POST') {
      const token = bearer(request)
      if (token) result(await db().from('planner_sessions').delete().eq('token_hash', tokenHash(token)))
      return json({ ok: true })
    }
    const username = await sessionUser(request)
    if (!username) throw new ApiError(401, 'Please sign in.')
    if (path === '/api/agent/vm/host/register' && method === 'POST') return await registerVmHost(username)
    if (path === '/api/agent/vm' || path.startsWith('/api/agent/vm/')) return await handleVmRequest(request, path, username)
    if (path === '/api/agent/chats' || path === '/api/agent/chats/remove' || path === '/api/agent/mcp/disconnect') return await handleChatLinks(request, path, username)
    if (path.startsWith('/api/agent/')) return await handleAgentRequest(request, path, username)
    if (path === '/api/calendar' && method === 'GET') {
      const row = dataResult(await db().from('planner_calendars').select('state,revision').eq('username', username).single())
      return json({ ...row.state, revision: row.revision })
    }
    if (['/api/files/bin','/api/files/trash','/api/files/restore','/api/files/purge'].includes(path))return await handleFilesBin(request,path,username)
    if (path === '/api/calendar' && method === 'PUT') {
      const input = await body(request)
      if (!Array.isArray(input.events) || !Array.isArray(input.tags) || !Array.isArray(input.hiddenTagIds)) throw new ApiError(400, 'Invalid calendar data.')
      const state = { events: input.events, tags: input.tags, hiddenTagIds: input.hiddenTagIds, zoom: typeof input.zoom === 'number' ? input.zoom : 1 }
      if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new ApiError(409, 'Reload your calendar before saving.')
      const rows = dataResult(await db().from('planner_calendars').update({ state, revision: Number(input.revision) + 1, updated_at: new Date().toISOString() }).eq('username', username).eq('revision', input.revision).select('revision'))
      if (!rows.length) throw new ApiError(409, 'Your calendar changed during a sync or in another tab. Reload before saving.')
      return json({ ok: true, revision: rows[0].revision })
    }
    if (path === '/api/files' && method === 'GET') {
      await cleanupUploads(username)
      return json(await filesFor(username))
    }
    if (path === '/api/files' && method === 'PUT') {
      const input = await body(request)
      validateFilesState(input)
      const previous = await filesFor(username)
      if (input.revision !== previous.revision) throw new ApiError(409, 'Files changed in another tab. Reload before saving again.')
      const pdfs = (input.documents ?? []).filter((document) => document.kind === 'pdf')
      if (pdfs.length) {
        const uploads = dataResult(await db().from('planner_uploads').select('id,size,status').eq('username', username).in('id', pdfs.map((pdf) => pdf.id)))
        if (pdfs.some((pdf) => !uploads.some((upload) => upload.id === pdf.id && upload.status === 'complete' && upload.size === pdf.size))) throw new ApiError(400, 'A PDF is not available in this account. Reload your files.')
      }
      const saved = await preserveRemovedFiles(username,input,previous) || await setFiles(username, input, previous)
      await cleanupUploads(username)
      return json({ ok: true, revision: saved.revision })
    }
    if (path === '/api/files/upload/start' && method === 'POST') {
      const input = await body(request)
      const state = await filesFor(username)
      const id = randomUUID()
      const document: PlannerDocument = { id, folderId: input.folderId === null ? null : String(input.folderId ?? ''), name: String(input.name ?? '').trim(), kind: 'pdf', size: Number(input.size), updatedAt: new Date().toISOString() }
      if (!document.name.toLowerCase().endsWith('.pdf')) throw new ApiError(400, 'Choose a PDF file.')
      validateFilesState({ ...state, documents: [...(state.documents ?? []), document] })
      const storagePath = `${username}/${id}.pdf`
      const signed = dataResult(await db().storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false }))
      result(await db().from('planner_uploads').insert({ id, username, folder_id: document.folderId, name: document.name, size: document.size, storage_path: storagePath }))
      return json({ mode: 'signed', id, uploadUrl: signed.signedUrl })
    }
    if (path === '/api/files/upload/finish' && method === 'POST') {
      const input = await body(request)
      const upload = await ownedUpload(username, String(input.id ?? ''))
      const state = await filesFor(username)
      if (upload.status === 'complete' && state.documents?.some((document) => document.id === upload.id)) return json(state)
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
      validateFilesState(next)
      result(await db().from('planner_uploads').update({ status: 'complete' }).eq('username', username).eq('id', upload.id))
      try { return json(await setFiles(username, next, state)) }
      catch (error) { await db().from('planner_uploads').update({ status: 'pending' }).eq('username', username).eq('id', upload.id); throw error }
    }
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
    if (error instanceof Error && /Names must|already exists|folder|file|document|link|label|color|Invalid|Too many|workspace/i.test(error.message)) return json({ error: error.message }, 400)
    console.error('Planner API failed', { path, method, type: error instanceof Error ? error.name : 'unknown' })
    return json({ error: 'Could not complete this request. Please try again.' }, 500)
  }
}
