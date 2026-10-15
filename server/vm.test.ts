import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { hostOnline, safeWorkerStatus, uuid, vmMessage } from './vm-validation.js'
import { sealVmCredential, openVmCredential } from './vm-vault.js'
import { handleCloudRequest } from './cloud.js'

test('worker routes reject missing and malformed credentials before any database access', async () => {
  for (const token of ['', 'sk-not-a-worker-token', 'pvm_short']) {
    const response = await handleCloudRequest(new Request('https://planner.test/api/agent/vm/worker/claim', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: '{}' }))
    assert.equal(response.status, 401)
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
