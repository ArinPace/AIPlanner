import { readFile, writeFile, mkdir, rename, symlink, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { dependencyDigest, validateRelease } from './update-protocol.mjs'

const execute = promisify(execFile)
export async function readUpdate(url, maxBytes, send = fetch) {
  const response = await send(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('Worker release is unavailable.')
  let size = 0
  const chunks = []
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maxBytes) throw new Error('Worker release exceeds size limit.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function stageUpdate({ origin, dataDir, baseDir = '/opt/planner', current, blocked = [], send }) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('Invalid update origin.')
  const channel = JSON.parse((await readUpdate(new URL('/worker-updates/channel.json', url), 4096, send)).toString())
  if (channel.protocol !== 1 || !/^[a-f0-9]{64}$/.test(channel.revision)) throw new Error('Invalid worker update channel.')
  if (channel.revision === current || blocked.includes(channel.revision)) return null
  const dependencies = dependencyDigest(await readFile(path.join(baseDir, 'package.json'), 'utf8'), await readFile(path.join(baseDir, 'package-lock.json'), 'utf8'))
  const bytes = await readUpdate(new URL('/worker-updates/' + channel.revision + '.json', url), 4 * 1024 * 1024, send)
  const release = validateRelease(bytes, channel.revision, dependencies)
  const releases = path.join(dataDir, 'releases')
  await mkdir(releases, { recursive: true, mode: 0o700 })
  const destination = path.join(releases, channel.revision)
  const temporary = destination + '.staging'
  await rm(temporary, { recursive: true, force: true })
  await mkdir(temporary, { mode: 0o700 })
  try {
    for (const [name, contents] of Object.entries(release.files)) {
      const filename = path.join(temporary, name)
      await writeFile(filename, contents, { mode: 0o600, flag: 'wx' })
      await execute(process.execPath, ['--check', filename], { timeout: 10000 })
    }
    await symlink(path.join(baseDir, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    // A previous complete staging attempt is reusable only after this validation.
    await rm(destination, { recursive: true, force: true })
    await rename(temporary, destination)
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error }
  return channel.revision
}

export function idleUpdater({ origin, dataDir, current = process.env.PLANNER_WORKER_REVISION, send = fetch, now = Date.now, stage = stageUpdate, managed = typeof process.send === 'function', request = revision => new Promise((resolve, reject) => process.send({ type: 'update', revision }, error => error ? reject(error) : resolve())) }) {
  let nextCheck = 0
  return async function check({ busy = false } = {}) {
    if (!managed || busy || now() < nextCheck) return false
    nextCheck = now() + 5 * 60000
    const state = JSON.parse(await readFile(path.join(dataDir, 'worker-updates.json'), 'utf8').catch(() => '{}'))
    const revision = await stage({ origin, dataDir, current, blocked: state.blocked || [], send })
    if (!revision) return false
    await request(revision)
    return true
  }
}
