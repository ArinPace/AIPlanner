import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { hostOnline, safeWorkerStatus, safeDeviceAuthorization, uuid, vmMessage } from './vm-validation.js'
import { sealVmCredential, openVmCredential } from './vm-vault.js'
import { handleCloudRequest } from './cloud.js'
import { scheduleSlot, shouldRunVm, validateSchedule } from './vm-power.js'

test('offline-user schedules wake only around New York slots, then stop after the slot completes', () => {
  const now = new Date('2026-10-15T10:59:00Z')
  assert.equal(scheduleSlot(now), '2026-10-15 07')
  assert.equal(scheduleSlot(new Date('2026-10-15T21:00:00Z')), '2026-10-15 17')
  assert.equal(scheduleSlot(new Date('2026-12-15T12:00:00Z')), '2026-12-15 07')
  assert.equal(scheduleSlot(new Date('2026-10-15T15:00:00Z')), null)
  assert.equal(shouldRunVm({ jobs: [], scheduled: true }, now), true)
  assert.equal(shouldRunVm({ jobs: [{ kind: 'sync', status: 'completed', schedule_slot: '2026-10-15 07' }], scheduled: true }, now), false)
  assert.equal(shouldRunVm({ jobs: [], scheduled: false }, now), false)
  assert.equal(shouldRunVm({ jobs: [{ kind: 'chat', status: 'queued' }], scheduled: false }, now), true)
  assert.equal(shouldRunVm({ jobs: [{ kind: 'browser_login', status: 'completed', result: { expiresAt: '2026-10-15T11:05:00Z' } }], scheduled: false }, now), true)
})
test('chat messages wake sleeping guests and keep them warm only during conversation', () => {
  const now = new Date('2026-10-16T14:00:00Z')
  assert.equal(shouldRunVm({ jobs: [{kind:'chat',status:'queued'}], scheduled:false }, now), true)
  assert.equal(shouldRunVm({ jobs: [{kind:'chat',status:'completed',finished_at:'2026-10-16T13:58:00Z'}], scheduled:false }, now), true)
  assert.equal(shouldRunVm({ jobs: [{kind:'chat',status:'completed',finished_at:'2026-10-16T13:31:00Z'}], scheduled:false }, now), true)
  assert.equal(shouldRunVm({ jobs: [], scheduled:false, wakeUntil:'2026-10-16T14:01:00Z' }, now), true)
  assert.equal(shouldRunVm({ jobs: [], scheduled:false, wakeUntil:'2026-10-16T13:59:00Z' }, now), false)
  assert.equal(shouldRunVm({ jobs: [{kind:'chat',status:'completed',finished_at:'2026-10-16T13:29:00Z'}], scheduled:false }, now), false)
  assert.equal(shouldRunVm({ jobs: [{kind:'sync',status:'completed',finished_at:'2026-10-16T13:59:00Z'}], scheduled:false }, now), false)
})
test('custom schedules validate and share the same due slot between wake and worker paths', () => {
  const schedule = validateSchedule({timezone:'Asia/Singapore',times:['17:45','07:30','07:30']})
  assert.deepEqual(schedule.times,['07:30','17:45'])
  const early = new Date('2026-10-15T23:28:00Z')
  assert.equal(scheduleSlot(early,schedule),'2026-10-16 07:30 Asia/Singapore')
  assert.equal(scheduleSlot(early,schedule,false),null)
  assert.equal(scheduleSlot(new Date('2026-10-15T23:35:00Z'),schedule,false),'2026-10-16 07:30 Asia/Singapore')
  assert.equal(scheduleSlot(new Date('2026-10-16T01:00:00Z'),schedule,false),null)
  assert.equal(shouldRunVm({scheduled:true,schedule,jobs:[]},early),true)
  assert.equal(shouldRunVm({scheduled:true,schedule,jobs:[{kind:'sync',status:'completed',schedule_slot:'2026-10-16 07:30 Asia/Singapore'}]},early),false)
  for(const invalid of [{timezone:'bad/zone',times:['07:00']},{timezone:'UTC',times:['25:00']},{timezone:'UTC',times:[]}])assert.throws(()=>validateSchedule(invalid))
})
test('personal device authorization cannot turn into public auth, phishing links or token disclosure', () => {
  const device = { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234', access_token: 'must-not-leak' }
  assert.deepEqual(safeDeviceAuthorization(device, true), { verificationUrl: device.verificationUrl, userCode: device.userCode })
  assert.equal(safeDeviceAuthorization(device, false), null)
  for (const url of ['https://auth.openai.com.evil.test/codex/device', 'https://auth.openai.com/codex/device?token=secret', 'javascript:alert(1)']) assert.equal(safeDeviceAuthorization({ ...device, verificationUrl: url }, true), null)
  assert.equal(safeDeviceAuthorization({ ...device, userCode: '<script>secret</script>' }, true), null)
})

test('worker routes reject missing and malformed credentials before any database access', async () => {
  for (const route of ['worker/claim', 'host/claim', 'host/finish']) {
    for (const token of ['', 'sk-not-a-worker-token', 'pvm_short']) {
      const response = await handleCloudRequest(new Request('https://planner.test/api/agent/vm/' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: '{}' }))
      assert.equal(response.status, 401)
    }
  }
})
test('VM credentials are authenticated ciphertext and cannot be decrypted after tampering', () => {
  const previous = process.env.CONNECTION_ENCRYPTION_KEY
  process.env.CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  try {
    const credential = { apiKey: 'private-test-value' }, sealed = sealVmCredential(credential)
    assert.ok(!sealed.includes(credential.apiKey)); assert.deepEqual(openVmCredential(sealed), credential)
    const parts = sealed.split('.'); parts[1] = randomBytes(16).toString('base64url')
    assert.throws(() => openVmCredential(parts.join('.')))
    process.env.CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString('hex'); assert.throws(() => openVmCredential(sealed))
  } finally { if (previous === undefined) delete process.env.CONNECTION_ENCRYPTION_KEY; else process.env.CONNECTION_ENCRYPTION_KEY = previous }
})
test('VM input and public worker status do not accept extra secrets or pretend stale hosts are online', () => {
  assert.throws(() => vmMessage(' ')); assert.throws(() => vmMessage('x'.repeat(12001)))
  assert.equal(vmMessage(' hello '), 'hello')
  assert.equal(uuid('01a1321e-1f00-7511-bff3-2a30078a049f'), true); assert.equal(uuid('../credentials'), false)
  const now = Date.now(); assert.equal(hostOnline(new Date(now - 60000).toISOString(), now), true)
  assert.equal(hostOnline(new Date(now - 100000).toISOString(), now), false)
  assert.deepEqual(safeWorkerStatus({ signedIn: true, identity: 'test', access_token: 'secret', recordings: true }), { runtime: 'codex', recordings: false, signedIn: true, identity: 'test', version: null })
})
