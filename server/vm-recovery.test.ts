import test from 'node:test'
import assert from 'node:assert/strict'
import { workerRecovery } from './vm-recovery.js'
const now = Date.parse('2026-11-25T01:40:00Z')
const base = { heartbeat:'2026-11-25T01:00:00Z', recoveredHeartbeat:null, recoveringSince:null, power:'Running', hasLease:false, wantsRun:true }
test('stalled worker is gracefully stopped once, then restarted only after power off', () => {
 assert.equal(workerRecovery(base, now), 'stop')
 assert.equal(workerRecovery({...base,recoveringSince:'2026-11-25T01:39:00Z'}, now), 'stop')
 assert.equal(workerRecovery({...base,recoveringSince:'2026-11-25T01:39:00Z',power:'Off'}, now), 'start')
 assert.equal(workerRecovery({...base,recoveredHeartbeat:base.heartbeat}, now), 'none')
})
test('healthy, idle, unpaired and actively leased workers are not rebooted', () => {
 for(const override of [{heartbeat:new Date(now-10000).toISOString()},{heartbeat:null},{hasLease:true},{wantsRun:false},{power:'Starting'}]) assert.equal(workerRecovery({...base,...override}, now), 'none')
})
