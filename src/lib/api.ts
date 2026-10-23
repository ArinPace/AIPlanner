import type { StoredState } from '../types'
import { DEFAULT_TAGS } from './storage'
import type { FilesState } from './files'

const TOKEN_KEY = 'ai-planner-token'
export function fixedCalendarSync<T>(run=false){return request<T>('/api/calendar/google-sync',run?{method:'POST',body:'{}'}:{})}
export function planningRequest<T>(input?:unknown):Promise<T>{return request<T>('/api/planning',input===undefined?{}:{method:'POST',body:JSON.stringify(input)})}
export function noteHistoryRequest<T>(noteId:string,options:{before?:number;versionId?:number;offset?:number}={}):Promise<T>{return request<T>('/api/files/history?'+new URLSearchParams({noteId,...Object.fromEntries(Object.entries(options).map(([key,value])=>[key,String(value)]))}))}
export function calendarHistoryRequest<T>(options:{before?:number;versionId?:number}={}):Promise<T>{return request<T>('/api/calendar/history?'+new URLSearchParams(Object.fromEntries(Object.entries(options).map(([key,value])=>[key,String(value)]))))}
export function restoreCalendarVersion(input:{versionId:number;revision:number;side:'before'|'after';overwrite:boolean}){return request('/api/calendar/restore',{method:'POST',body:JSON.stringify(input)})}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  let response: Response
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

export function login(username: string, password: string) {
  return request<{ token: string; username: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function register(username: string, password: string) {
  return request<{ token: string; username: string }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return request<{ ok: boolean }>('/api/logout', { method: 'POST' })
}

export function getSession() {
  return request<{ username: string | null }>('/api/session')
}

let calendarRevision: number | undefined
export function adoptCalendarRevision(revision: number | undefined) { calendarRevision = revision }
export async function loadCalendar({ adopt = true }: { adopt?: boolean } = {}) {
  const state = await request<StoredState>('/api/calendar')
  if (adopt) adoptCalendarRevision(state.revision)
  return state
}

export async function saveCalendar(state: StoredState) {
  const saved = await request<{ ok: boolean; revision?: number }>('/api/calendar', {
    method: 'PUT',
    body: JSON.stringify({ ...state, revision: calendarRevision }),
  })
  calendarRevision = saved.revision
  return saved
}

export function emptyCalendar(): StoredState {
  return { events: [], tags: DEFAULT_TAGS, hiddenTagIds: [], zoom: 1 }
}

export function loadFiles() {
  return request<FilesState>('/api/files')
}

export async function saveFiles(state: FilesState) {
  const saved=await request<{ ok: boolean; revision?: number; planningSyncError?:string }>('/api/files', { method: 'PUT', body: JSON.stringify(state) })
  window.dispatchEvent(new Event('planner-calendar-refresh'))
  return saved
}
export interface FileBinEntry {id:string;names:string[];item_count:number;deleted_at:string;expires_at:string}
export function loadFileBin(){return request<{items:FileBinEntry[]}>('/api/files/bin')}
export function fileBinAction(action:'trash'|'restore'|'purge',ids:string[],revision:number){return request<FilesState>('/api/files/'+action,{method:'POST',body:JSON.stringify({ids,revision})})}

export async function uploadPdf(folderId: string | null, file: File) {
  if (!(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('Choose a valid PDF file.')
  const ticket = await request<{ mode: 'local' | 'signed'; id?: string; uploadUrl?: string }>('/api/files/upload/start', {
    method: 'POST', body: JSON.stringify({ folderId, name: file.name, size: file.size }),
  })
  if (ticket.mode === 'local') return request<FilesState>(`/api/files/upload?folderId=${encodeURIComponent(folderId ?? '')}`, {
    method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) },
  })
  try {
    const upload = await fetch(ticket.uploadUrl!, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file })
    if (!upload.ok) throw new Error('Could not upload the PDF. Please try again.')
    return await request<FilesState>('/api/files/upload/finish', { method: 'POST', body: JSON.stringify({ id: ticket.id }) })
  } catch (error) {
    await request('/api/files/upload/cancel', { method: 'POST', body: JSON.stringify({ id: ticket.id }) }).catch(() => undefined)
    throw error
  }
}

export async function downloadPdf(id: string, name: string) {
  const token = getToken()
  const response = await fetch(`/api/files/documents/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!response.ok) throw new Error('Could not download this PDF. Please try again.')
  const blob = response.headers.get('Content-Type')?.includes('application/json')
    ? await fetch((await response.json() as { downloadUrl: string }).downloadUrl).then((download) => { if (!download.ok) throw new Error('Could not download PDF.'); return download.blob() })
    : await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = /\.pdf$/i.test(name) ? name : `${name}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
