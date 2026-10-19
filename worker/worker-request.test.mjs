import test from 'node:test'
import assert from 'node:assert/strict'
import {workerRequest} from './worker-request.mjs'
test('checkpoint retries transient timeout and server failures without replaying claims',async()=>{
 let calls=0
 const result=await workerRequest('https://planner.test','test','progress',{reply:'saved'},{wait:async()=>{},fetch:async()=>{calls++;if(calls===1)throw Object.assign(new Error('timeout'),{name:'TimeoutError'});return calls===2?new Response('',{status:503}):Response.json({ok:true})}})
 assert.equal(result.ok,true);assert.equal(calls,3)
 calls=0
 await assert.rejects(()=>workerRequest('https://planner.test','test','claim',{}, {wait:async()=>{},fetch:async()=>{calls++;throw new TypeError('fetch failed')}}))
 assert.equal(calls,1)
})
test('retired leases and revoked credentials stop without retry',async()=>{
 for(const status of [401,403,409]){let calls=0;await assert.rejects(()=>workerRequest('https://planner.test','test','progress',{}, {wait:async()=>{},fetch:async()=>{calls++;return new Response('',{status})}}),error=>error.status===status);assert.equal(calls,1)}
})
