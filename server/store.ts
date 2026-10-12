import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type UserRecord = {
  passwordHash: string
  createdAt: string
}

export type UsersFile = Record<string, UserRecord>
export type SessionsFile = Record<string, string>

const DATA_DIR = join(process.cwd(), 'data')
const USERS_PATH = join(DATA_DIR, 'users.json')
const SESSIONS_PATH = join(DATA_DIR, 'sessions.json')
const CALENDARS_DIR = join(DATA_DIR, 'calendars')

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, data: unknown) {
  ensureDir(dirname(path))
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tempPath, path)
}

export function normalizeUsername(name: string): string | null {
  const username = name.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return null
  return username
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = scryptSync(password, salt, 64)
  const previous = Buffer.from(hash, 'hex')
  if (next.length !== previous.length) return false
  return timingSafeEqual(previous, next)
}

export function createToken(): string {
  return randomBytes(24).toString('hex')
}

export function getUsers(): UsersFile {
  ensureDir(DATA_DIR)
  return readJson<UsersFile>(USERS_PATH, {})
}

export function saveUsers(users: UsersFile) {
  writeJson(USERS_PATH, users)
}

export function getSessions(): SessionsFile {
  ensureDir(DATA_DIR)
  return readJson<SessionsFile>(SESSIONS_PATH, {})
}

export function saveSessions(sessions: SessionsFile) {
  writeJson(SESSIONS_PATH, sessions)
}

export function calendarPath(username: string): string {
  return join(CALENDARS_DIR, `${username}.json`)
}

export function readCalendar(username: string): unknown | null {
  try {
    return JSON.parse(readFileSync(calendarPath(username), 'utf8'))
  } catch {
    return null
  }
}

export function writeCalendar(username: string, data: unknown) {
  writeJson(calendarPath(username), data)
}

export function readFiles(username: string): unknown {
  const path = join(DATA_DIR, 'files', `${username}.json`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { folders: [], files: [] }
    throw new Error('Could not read your files. Your saved data has been left intact.')
  }
}

export function writeFiles(username: string, data: unknown) {
  writeJson(join(DATA_DIR, 'files', `${username}.json`), data)
}

function pdfPath(username: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid PDF ID.')
  return join(DATA_DIR, 'uploads', username, `${id}.pdf`)
}

export function writePdf(username: string, id: string, data: Buffer) {
  const path = pdfPath(username, id)
  ensureDir(dirname(path))
  writeFileSync(path, data)
}

export function readPdf(username: string, id: string) {
  return readFileSync(pdfPath(username, id))
}

export function deletePdf(username: string, id: string) {
  try { unlinkSync(pdfPath(username, id)) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
