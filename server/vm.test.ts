import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { hostOnline, safeWorkerStatus, safeDeviceAuthorization, uuid, vmMessage } from './vm-validation.js'
import { sealVmCredential, openVmCredential } from './vm-vault.js'
import { handleCloudRequest } from './cloud.js'
import { scheduleSlot, shouldRunVm } from './vm-power.js'

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
