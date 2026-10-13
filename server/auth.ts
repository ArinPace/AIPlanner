import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

export function normalizeUsername(name: string): string | null {
  const username = name.trim().toLowerCase()
  return /^[a-z0-9_]{3,24}$/.test(username) ? username : null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 64)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createToken(): string { return randomBytes(32).toString('hex') }
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex') }
