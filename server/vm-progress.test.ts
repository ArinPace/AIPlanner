import test from 'node:test'
import assert from 'node:assert/strict'
import {handleVmWorker} from './vm.js'
test('failure reports preserve the last saved reply instead of replacing it with an empty string',async()=>{
 process.env.SUPABASE_URL='https://progress.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const originalFetch=globalThis.fetch
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  if(url.pathname==='/rest/v1/planner_vm_hosts')return Response.json(req.method==='GET'?{id:'host',username:'owner'}:null)
  if(url.pathname==='/rest/v1/planner_vm_jobs'){assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(url.searchParams.get('host_id'),'eq.host');assert.ok(url.searchParams.has('lease'));return Response.json({reply:'Already saved progress'})}
  if(url.pathname==='/rest/v1/rpc/planner_vm_report'){const data=await req.json() as any;assert.equal(data.p_reply,'Already saved progress');assert.equal(data.p_finished,true);assert.equal(data.p_error,'Connection unavailable');return Response.json(true)}
  throw Error('Unexpected progress test route')
 }
 try{const response=await handleVmWorker(new Request('https://planner.test/api/agent/vm/worker/finish',{method:'POST',headers:{Authorization:'Bearer pvm_'+'a'.repeat(43),'Content-Type':'application/json'},body:JSON.stringify({id:'11111111-1111-4111-8111-111111111111',lease:'22222222-2222-4222-8222-222222222222',error:'Connection unavailable',reply:''})}),'/api/agent/vm/worker/finish');assert.equal(response.status,200)}finally{globalThis.fetch=originalFetch}
})
