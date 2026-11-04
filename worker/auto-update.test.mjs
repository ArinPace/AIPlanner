import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dependencyDigest, digest, validateRelease } from './update-protocol.mjs'
import { stageUpdate, readUpdate, idleUpdater } from './auto-update.mjs'
import { launchWorker } from './update-launcher.mjs'

const waitFor = async check => { for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 20)) } throw new Error('Timed out') }
test('release rejects tampering, traversal and changed dependencies', () => {
  const release = { protocol: 1, dependencies: 'deps', files: { 'main.mjs': 'export {}', 'auto-update.mjs': 'export {}' } }
  const encode = () => Buffer.from(JSON.stringify(release))
  let bytes = encode()
  assert.ok(validateRelease(bytes, digest(bytes), 'deps'))
  assert.throws(() => validateRelease(bytes, '0'.repeat(64), 'deps'), /checksum/)
  assert.throws(() => validateRelease(bytes, digest(bytes), 'other'), /dependencies/)
  release.files['../worker.json'] = 'bad'; bytes = encode()
  assert.throws(() => validateRelease(bytes, digest(bytes), 'deps'), /Invalid/)
})
test('HTTPS release stages code without touching credentials and skips blocked versions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'planner-update-'))
  try {
    const baseDir = path.join(root, 'base'), dataDir = path.join(root, 'data')
    await mkdir(baseDir); await mkdir(dataDir)
    await mkdir(path.join(baseDir, 'node_modules'))
    await writeFile(path.join(baseDir, 'package.json'), '{}'); await writeFile(path.join(baseDir, 'package-lock.json'), '{}')
    await writeFile(path.join(dataDir, 'worker.json'), 'preserve-me')
    const bytes = Buffer.from(JSON.stringify({ protocol: 1, dependencies: dependencyDigest('{}', '{}'), files: { 'main.mjs': 'export {}', 'auto-update.mjs': 'export {}' } }))
    const revision = digest(bytes)
    const send = async url => new Response(String(url).endsWith('channel.json') ? JSON.stringify({ protocol: 1, revision }) : bytes)
    assert.equal(await stageUpdate({ origin: 'https://planner.example/', dataDir, baseDir, send, blocked: [revision] }), null)
    assert.equal(await stageUpdate({ origin: 'https://planner.example/', dataDir, baseDir, send }), revision)
    assert.equal(await readFile(path.join(dataDir, 'releases', revision, 'main.mjs'), 'utf8'), 'export {}')
    assert.equal(await readFile(path.join(dataDir, 'worker.json'), 'utf8'), 'preserve-me')
    await assert.rejects(stageUpdate({ origin: 'http://planner.example/', dataDir, baseDir, send }), /origin/)
    await assert.rejects(readUpdate('https://planner.example/', 2, async () => new Response('large')), /size/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('failed candidate rolls back to the previous worker and records blocked revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'planner-launch-'))
  let launcher
  try {
    const revision = 'a'.repeat(64)
    await mkdir(path.join(root, 'releases', revision), { recursive: true })
    await writeFile(path.join(root, 'releases', revision, 'main.mjs'), 'process.exit(1)')
    await writeFile(path.join(root, 'main.mjs'), "process.send({type:'ready'});setInterval(()=>{},1000)")
    await writeFile(path.join(root, 'worker-updates.json'), JSON.stringify({ current: null, offered: revision, blocked: [] }))
    launcher = await launchWorker({ dataDir: root, baseDir: root, startupMs: 1000 })
    await waitFor(() => launcher.state().blocked.includes(revision))
    await launcher.settled()
    assert.equal(launcher.state().current, null)
    assert.match(launcher.state().lastError, /restored/)
  } finally { launcher?.stop(); await new Promise(r => setTimeout(r, 100)); await rm(root, { recursive: true, force: true }) }
})
test('updates defer during live browsers, check at most every five minutes and pass blocked revisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'planner-idle-'))
  try {
    await writeFile(path.join(root, 'worker-updates.json'), JSON.stringify({ blocked: ['bad'] }))
    let calls = 0, requested, clock = 1
    const check = idleUpdater({ origin: 'https://planner.example/', dataDir: root, managed: true, now: () => clock,
      stage: async options => { calls++; assert.deepEqual(options.blocked, ['bad']); return 'release' }, request: async value => { requested = value } })
    assert.equal(await check({ busy: true }), false); assert.equal(calls, 0)
    assert.equal(await check(), true); assert.equal(requested, 'release')
    assert.equal(await check(), false); assert.equal(calls, 1)
    clock += 300001; assert.equal(await check(), true); assert.equal(calls, 2)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('healthy candidate is committed only after a real readiness message', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'planner-healthy-'))
  let launcher
  try {
    const revision = 'b'.repeat(64)
    await mkdir(path.join(root, 'releases', revision), { recursive: true })
    await writeFile(path.join(root, 'releases', revision, 'main.mjs'), "process.send({type:'ready'});setInterval(()=>{},1000)")
    await writeFile(path.join(root, 'worker-updates.json'), JSON.stringify({ current: null, offered: revision, blocked: [] }))
    launcher = await launchWorker({ dataDir: root, baseDir: root, startupMs: 1000 })
    await waitFor(() => launcher.state().current === revision)
    await launcher.settled()
    assert.equal(JSON.parse(await readFile(path.join(root, 'worker-updates.json'), 'utf8')).current, revision)
    assert.equal(launcher.state().pending, undefined)
  } finally { launcher?.stop(); await new Promise(r => setTimeout(r, 100)); await rm(root, { recursive: true, force: true }) }
})
test('normal idle handoff starts the requested release and retains the previous version', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'planner-handoff-'))
  let launcher
  try {
    const previous = 'c'.repeat(64), revision = 'd'.repeat(64)
    for (const value of [previous, revision]) await mkdir(path.join(root, 'releases', value), { recursive: true })
    await writeFile(path.join(root, 'releases', previous, 'main.mjs'), `process.send({type:'ready'});setTimeout(()=>process.send({type:'update',revision:'${revision}'},()=>process.exit(75)),100)`)
    await writeFile(path.join(root, 'releases', revision, 'main.mjs'), "process.send({type:'ready'});setInterval(()=>{},1000)")
    await writeFile(path.join(root, 'worker-updates.json'), JSON.stringify({ current: previous, blocked: [] }))
    launcher = await launchWorker({ dataDir: root, baseDir: root, startupMs: 1000 })
    await waitFor(() => launcher.state().current === revision)
    await launcher.settled()
    assert.equal(launcher.state().previous, previous)
  } finally { launcher?.stop(); await new Promise(r => setTimeout(r, 100)); await rm(root, { recursive: true, force: true }) }
})
