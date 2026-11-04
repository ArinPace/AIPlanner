import { createHash } from 'node:crypto'

export const digest = value => createHash('sha256').update(value).digest('hex')
export const normalize = value => value.replace(/\r\n/g, '\n')
export const dependencyDigest = (pkg, lock) => digest(normalize(pkg) + '\n' + normalize(lock))
export const releaseName = name => /^[a-z][a-z0-9-]*\.mjs$/.test(name) && !name.endsWith('.test.mjs')

export function validateRelease(bytes, expected, dependencies) {
  if (!/^[a-f0-9]{64}$/.test(expected) || digest(bytes) !== expected) throw new Error('Worker release checksum mismatch.')
  const release = JSON.parse(bytes.toString('utf8'))
  if (release.protocol !== 1 || release.dependencies !== dependencies) throw new Error('Worker dependencies require an operator update.')
  const files = Object.entries(release.files || {})
  if (!files.length || files.length > 200 || !release.files['main.mjs'] || !release.files['auto-update.mjs']) throw new Error('Incomplete worker release.')
  for (const [name, contents] of files) {
    if (!releaseName(name) || typeof contents !== 'string' || Buffer.byteLength(contents) > 1024 * 1024) throw new Error('Invalid worker release file.')
  }
  return release
}
