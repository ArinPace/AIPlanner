import test from 'node:test'
import assert from 'node:assert/strict'
import {agentNetworkRequest as agentRequest} from '../src/lib/agentNetwork.js'
test('chat polling retries transient failures while send mutations are not replayed',async()=>{
 const originalFetch=globalThis.fetch
 let calls=0
 globalThis.fetch=async()=>{calls++;return calls<3?Response.json({},{status:503}):Response.json({connected:true})}
 try{
  assert.equal((await agentRequest<{connected:boolean}>('vm')).connected,true);assert.equal(calls,3)
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Temporarily unavailable'},{status:503})}
  await assert.rejects(()=>agentRequest('vm/chat',{method:'POST',body:'{}'}),/Temporarily unavailable/);assert.equal(calls,1)
 }finally{globalThis.fetch=originalFetch}
})
