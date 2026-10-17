import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { validateFilesState } from '../src/lib/files.ts'
import {
  createToken,
  getSessions,
  getUsers,
  hashPassword,
  normalizeUsername,
  readCalendar,
  readFiles,
  saveSessions,
  saveUsers,
  verifyPassword,
  writeCalendar,
  writeFiles,
  readPdf,
  writePdf,
  deletePdf,
} from './store.ts'

const DEFAULT_CALENDAR = {
  events: [],
  tags: [
    { id: 'work', name: 'Work', color: '#1a73e8' },
    { id: 'personal', name: 'Personal', color: '#0b8043' },
    { id: 'family', name: 'Family', color: '#d50000' },
    { id: 'health', name: 'Health', color: '#8e24aa' },
  ],
  hiddenTagIds: [],
  zoom: 1,
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7).trim() || null
}

async function readUpload(req: IncomingMessage): Promise<Buffer> {
  const limit = 25 * 1024 * 1024
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('PDFs must be 25 MB or smaller.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function usernameFromRequest(req: IncomingMessage): string | null {
  const token = bearerToken(req)
  if (!token) return null
  return getSessions()[token] ?? null
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split('?')[0] ?? ''
  if (!url.startsWith('/api/')) return false

  const method = req.method ?? 'GET'

  try {
    if (url === '/api/register' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { username?: string; password?: string }
      const username = normalizeUsername(body.username ?? '')
      const password = typeof body.password === 'string' ? body.password : ''
      if (!username) {
        send(res, 400, { error: 'Username must be 3–24 letters, numbers, or underscores.' })
        return true
      }
      if (password.length < 4) {
        send(res, 400, { error: 'Password must be at least 4 characters.' })
        return true
      }
      const users = getUsers()
      if (users[username]) {
        send(res, 409, { error: 'That username is already taken.' })
        return true
      }
      users[username] = { passwordHash: hashPassword(password), createdAt: new Date().toISOString() }
      saveUsers(users)
      writeCalendar(username, DEFAULT_CALENDAR)
      const token = createToken()
      const sessions = getSessions()
      sessions[token] = username
      saveSessions(sessions)
      send(res, 201, { token, username })
      return true
    }

    if (url === '/api/login' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { username?: string; password?: string }
      const username = normalizeUsername(body.username ?? '')
      const password = typeof body.password === 'string' ? body.password : ''
      const user = username ? getUsers()[username] : undefined
      if (!user || !verifyPassword(password, user.passwordHash)) {
        send(res, 401, { error: 'Wrong username or password.' })
        return true
      }
      const token = createToken()
      const sessions = getSessions()
      sessions[token] = username as string
      saveSessions(sessions)
      send(res, 200, { token, username })
      return true
    }

    if (url === '/api/logout' && method === 'POST') {
      const token = bearerToken(req)
      if (token) {
        const sessions = getSessions()
        delete sessions[token]
        saveSessions(sessions)
      }
      send(res, 200, { ok: true })
      return true
    }

    if (url === '/api/session' && method === 'GET') {
      send(res, 200, { username: usernameFromRequest(req) })
      return true
    }

    if (url === '/api/calendar' && method === 'GET') {
      const username = usernameFromRequest(req)
      if (!username) {
        send(res, 401, { error: 'Please sign in.' })
        return true
      }
      send(res, 200, readCalendar(username) ?? DEFAULT_CALENDAR)
      return true
    }

    if (url === '/api/calendar' && method === 'PUT') {
      const username = usernameFromRequest(req)
      if (!username) {
        send(res, 401, { error: 'Please sign in.' })
        return true
      }
      const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
      writeCalendar(username, {
        events: Array.isArray(body.events) ? body.events : [],
        tags: Array.isArray(body.tags) ? body.tags : DEFAULT_CALENDAR.tags,
        hiddenTagIds: Array.isArray(body.hiddenTagIds) ? body.hiddenTagIds : [],
        zoom: typeof body.zoom === 'number' ? body.zoom : 1,
      })
      send(res, 200, { ok: true })
      return true
    }

    if (url === '/api/files/upload/start' && method === 'POST') {
      if (!usernameFromRequest(req)) { send(res, 401, { error: 'Please sign in.' }); return true }
      send(res, 200, { mode: 'local' })
      return true
    }

    if (url === '/api/files/upload' && method === 'POST') {
      const username = usernameFromRequest(req)
      if (!username) { send(res, 401, { error: 'Please sign in.' }); return true }
      const state = readFiles(username)
      validateFilesState(state)
      const folderId = new URL(req.url ?? '', 'http://localhost').searchParams.get('folderId') || null
      if (folderId !== null && !state.folders.some((folder) => folder.id === folderId)) {
        send(res, 400, { error: 'Choose an existing folder.' }); return true
      }
      let data: Buffer
      const id = randomUUID()
      try {
        const name = decodeURIComponent(String(req.headers['x-file-name'] ?? '')).trim()
        data = await readUpload(req)
        if (!name.toLowerCase().endsWith('.pdf') || !data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('Choose a valid PDF file.')
        const next = { ...state, documents: [...(state.documents ?? []), { id, folderId, name, kind: 'pdf' as const, size: data.length, updatedAt: new Date().toISOString() }] }
        validateFilesState(next)
        writePdf(username, id, data)
        try { writeFiles(username, next) } catch (error) { deletePdf(username, id); throw error }
        send(res, 201, next)
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : 'Could not upload PDF.' })
      }
      return true
    }

    if (url.startsWith('/api/files/documents/') && method === 'GET') {
      const username = usernameFromRequest(req)
      if (!username) { send(res, 401, { error: 'Please sign in.' }); return true }
      const id = url.slice('/api/files/documents/'.length)
      const state = readFiles(username)
      validateFilesState(state)
      const document = state.documents?.find((item) => item.id === id && item.kind === 'pdf')
      if (!document) { send(res, 404, { error: 'PDF not found.' }); return true }
      const data = readPdf(username, id)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(document.name)}`)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(data)
      return true
    }

    if (url === '/api/files' && (method === 'GET' || method === 'PUT')) {
      const username = usernameFromRequest(req)
      if (!username) {
        send(res, 401, { error: 'Please sign in.' })
        return true
      }
      if (method === 'GET') {
        const state = readFiles(username)
        validateFilesState(state)
        send(res, 200, state)
      } else {
        let state: unknown
        try {
          state = JSON.parse((await readBody(req)) || '{}')
          validateFilesState(state)
        } catch (error) {
          send(res, 400, { error: error instanceof Error ? error.message : 'Invalid files data.' })
          return true
        }
        const previous = readFiles(username)
        validateFilesState(previous)
        writeFiles(username, state)
        for (const document of previous.documents ?? []) {
          if (document.kind === 'pdf' && !state.documents?.some((item) => item.id === document.id)) deletePdf(username, document.id)
        }
        send(res, 200, { ok: true })
      }
      return true
    }

    send(res, 404, { error: 'Not found' })
    return true
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : 'Server error' })
    return true
  }
}
