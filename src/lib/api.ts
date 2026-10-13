import type { StoredState } from '../types'
import { DEFAULT_TAGS } from './storage'
import type { FilesState } from './files'

const TOKEN_KEY = 'ai-planner-token'

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

export function loadCalendar() {
  return request<StoredState>('/api/calendar')
}

export function saveCalendar(state: StoredState) {
  return request<{ ok: boolean }>('/api/calendar', {
    method: 'PUT',
    body: JSON.stringify(state),
  })
}

export function emptyCalendar(): StoredState {
  return { events: [], tags: DEFAULT_TAGS, hiddenTagIds: [], zoom: 1 }
}

export function loadFiles() {
  return request<FilesState>('/api/files')
}

export function saveFiles(state: FilesState) {
  return request<{ ok: boolean; revision?: number }>('/api/files', { method: 'PUT', body: JSON.stringify(state) })
}

export async function uploadPdf(folderId: string, file: File) {
  if (!(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('Choose a valid PDF file.')
  const ticket = await request<{ mode: 'local' | 'signed'; id?: string; uploadUrl?: string }>('/api/files/upload/start', {
    method: 'POST', body: JSON.stringify({ folderId, name: file.name, size: file.size }),
  })
  if (ticket.mode === 'local') return request<FilesState>(`/api/files/upload?folderId=${encodeURIComponent(folderId)}`, {
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
