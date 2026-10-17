import test from 'node:test'
import assert from 'node:assert/strict'
import {vmJobStatus} from '../src/lib/vmJobStatus.js'
import type {VmJob,VmState} from '../src/lib/vm.js'

const now=Date.parse('2026-10-18T00:10:00Z')
const job={id:'waiting',status:'queued',created_at:'2026-10-18T00:08:30Z'} as VmJob
const state=(value:Partial<VmState>)=>({hosts:[],runs:[],...value}) as VmState
test('queued work on a running VM never claims the computer is waking',()=>{
  assert.match(vmJobStatus(job,state({power:'online'}),now),/Waiting for your agent.*1m 30s/)
  assert.match(vmJobStatus(job,state({power:'online',queue:{active:{id:'review',kind:'sync',chat_id:null,started_at:'2026-10-18T00:00:00Z'},queuedIds:['waiting']}}),now),/Queued behind a source review/)
  assert.match(vmJobStatus(job,state({power:'offline'}),now),/Waking your private computer/)
  assert.match(vmJobStatus({...job,status:'running',started_at:'2026-10-18T00:09:40Z'},null,now),/Working.*20s/)
})
