import test from 'node:test'
import assert from 'node:assert/strict'
import {continuationPrompt,monitorRun} from './run-control.mjs'

test('resume and steering preserve prior context and newest user instructions',()=>{
 assert.equal(continuationPrompt({message:'Hello'}),'Hello')
 const resumed=continuationPrompt({message:'Organize files',continuation:true,reply:'Folder created'})
 assert.match(resumed,/do not duplicate completed work/);assert.match(resumed,/Folder created/);assert.ok(resumed.endsWith('Organize files'))
 const steered=continuationPrompt({message:'Only check CS',continuation_context:'Previously check all courses'})
 assert.match(steered,/newest message/);assert.ok(steered.endsWith('Only check CS'))
})

test('control monitor serializes checkpoints and stops once after a retired lease',async()=>{
 let active=0,max=0,calls=0,stopped=0
 const error=Object.assign(new Error('paused'),{status:409})
 let finish
 const done=new Promise(resolve=>{finish=resolve})
 const stop=monitorRun(async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,25));active--;if(calls===2)throw error},async received=>{assert.equal(received,error);stopped++;finish()},5)
 await done;await new Promise(r=>setTimeout(r,30));stop()
 assert.equal(max,1);assert.equal(calls,2);assert.equal(stopped,1)
})

test('one lost checkpoint does not kill a run; recovered connection still honors cancellation',async()=>{
 let calls=0,stopped=0,finish
 const done=new Promise(resolve=>{finish=resolve})
 const stop=monitorRun(async()=>{calls++;if(calls===1)throw Object.assign(new Error('timeout'),{name:'TimeoutError'});if(calls===3)throw Object.assign(new Error('cancelled'),{status:409})},async error=>{assert.equal(error.status,409);stopped++;finish()},2)
 await done;stop();assert.equal(calls,3);assert.equal(stopped,1)
})
test('prolonged connection loss stops before running indefinitely without a lease',async()=>{
 let elapsed=0,finish
 const done=new Promise(resolve=>{finish=resolve})
 const stop=monitorRun(async()=>{elapsed+=30000;throw new TypeError('fetch failed')},async error=>{assert.match(error.message,/Saved progress is kept/);finish()},2,{graceMs:60000,now:()=>elapsed})
 await done;stop();assert.equal(elapsed,60000)
})
