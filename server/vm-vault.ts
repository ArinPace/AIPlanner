import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ApiError } from './cloud.js'
function key() {
  const value = process.env.CONNECTION_ENCRYPTION_KEY || ''
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new ApiError(503, 'Secure connection storage is not configured.')
  return Buffer.from(value, 'hex')
}
export function sealVmCredential(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64url')).join('.')
}
export function openVmCredential(value: string) {
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64url'))
  const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')) as { apiKey: string }
}
