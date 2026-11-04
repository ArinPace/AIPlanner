// Stable, unprivileged supervisor. Releases cannot replace this installer-owned file.
import { fork } from 'node:child_process'
import { readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const validRevision = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export async function launchWorker({ dataDir = process.env.PLANNER_DATA_DIR || '/var/lib/planner', baseDir = '/opt/planner', startupMs = 120000, spawn = fork } = {}) {
  const filename = path.join(dataDir, 'worker-updates.json')
  let state = JSON.parse(await readFile(filename, 'utf8').catch(() => '{}'))
  if (state.current && !validRevision(state.current)) throw new Error('Invalid installed worker revision.')
  // A host reboot during candidate startup must not activate an unverified release.
  state.blocked = (state.blocked || []).filter(validRevision)
  if (validRevision(state.pending)) { state.blocked.push(state.pending); delete state.pending }
  const offered = validRevision(state.offered) ? state.offered : null
  delete state.offered
  if (offered) state.pending = offered
  const save = async () => {
    await writeFile(filename + '.tmp', JSON.stringify(state), { mode: 0o600 })
    for (let attempt = 0; ; attempt++) {
      try { await rename(filename + '.tmp', filename); break }
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(error.code) || attempt === 9) throw error
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    }
  }
  await save()
  let child, stopping = false, serial = Promise.resolve()
  const enqueue = fn => { serial = serial.then(fn).catch(error => { console.error(error.message); process.exitCode = 1; child?.kill('SIGTERM') }) }
  function start(candidate = null) {
    const revision = candidate || state.current
    const root = revision ? path.join(dataDir, 'releases', revision) : baseDir
    let ready = false, requested = null, timer
    child = spawn(path.join(root, 'main.mjs'), [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, PLANNER_WORKER_REVISION: revision || '' },
    })
    const running = child
    const terminate = () => {
      running.kill('SIGTERM')
      const kill = setTimeout(() => running.kill('SIGKILL'), 10000)
      kill.unref(); running.once('exit', () => clearTimeout(kill))
    }
    if (candidate) timer = setTimeout(terminate, startupMs)
    running.on('message', message => enqueue(async () => {
      if (message?.type === 'ready') {
        ready = true; clearTimeout(timer)
        if (candidate) {
          state.previous = state.current || null; state.current = candidate
          delete state.pending; state.lastError = null; await save()
          console.log('Worker release healthy: ' + candidate)
        }
      }
      if (message?.type === 'update' && ready && validRevision(message.revision) && message.revision !== revision && !state.blocked.includes(message.revision)) {
        requested = message.revision; state.pending = requested; await save()
      }
    }))
    running.once('error', () => terminate())
    running.once('exit', code => enqueue(async () => {
      clearTimeout(timer)
      if (stopping) { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); return }
      if (candidate && !ready) {
        state.blocked = [...new Set([...state.blocked, candidate])]
        delete state.pending; state.lastError = 'Release failed startup; previous worker restored.'
        await save(); console.error(state.lastError); start(); return
      }
      if (requested && code === 75) { start(requested); return }
      // Let systemd restart the supervisor for ordinary worker failures.
      process.exitCode = code || 1
      process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop)
    }))
  }
  function stop() { stopping = true; child?.kill('SIGTERM') }
  process.on('SIGTERM', stop); process.on('SIGINT', stop)
  start(offered)
  return { stop, state: () => state, settled: () => serial }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await launchWorker()
