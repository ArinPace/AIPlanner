import { createHash } from 'node:crypto'

export const vmHash = (value: string) => createHash('sha256').update(value).digest('hex')
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function vmMessage(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 12000) throw new Error('Write a message of 1–12,000 characters.')
  return value.trim()
}
export function hostOnline(heartbeat: string | null, now = Date.now()): boolean {
  return Boolean(heartbeat && Number.isFinite(Date.parse(heartbeat)) && now - Date.parse(heartbeat) < 90000)
}
export function safeWorkerStatus(value: unknown) {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    runtime: 'codex', recordings: false,
    signedIn: input.signedIn === true,
    identity: typeof input.identity === 'string' ? input.identity.slice(0, 160) : null,
    version: typeof input.version === 'string' ? input.version.slice(0, 40) : null,
  }
}
