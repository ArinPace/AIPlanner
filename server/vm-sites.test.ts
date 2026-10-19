import test from 'node:test'
import assert from 'node:assert/strict'
import {handleVmWorker} from './vm.js'

test('observed connections merge atomically instead of overwriting a stale sites snapshot',async()=>{
 process.env.SUPABASE_URL='https://sites.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const originalFetch=globalThis.fetch
 let merged=false
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  if(url.pathname==='/rest/v1/planner_vm_hosts')return Response.json(req.method==='GET'?{id:'host',username:'owner',capabilities:{}}:null)
  if(url.pathname==='/rest/v1/planner_vm_settings'){
   assert.equal(req.method,'GET','Never replace sites using the earlier settings snapshot')
   return Response.json({sources:['albert','gmail'],sites:{gmail:{ready:true}},schedule_enabled:false})
  }
  if(url.pathname==='/rest/v1/rpc/planner_browser_account_update')return Response.json(null)
  if(url.pathname==='/rest/v1/rpc/planner_merge_browser_sites'){
   const body=await req.json() as any
   assert.equal(body.p_username,'owner')
   assert.deepEqual(Object.keys(body.p_sites),['albert'])
   assert.equal(body.p_sites.albert.ready,true)
   merged=true
   return Response.json(null)
  }
  if(url.pathname==='/rest/v1/rpc/planner_vm_claim')return Response.json(null)
  throw Error('Unexpected connection test route: '+url.pathname)
 }
 try{
  const response=await handleVmWorker(new Request('https://planner.test/api/agent/vm/worker/claim',{method:'POST',headers:{Authorization:'Bearer pvm_'+'a'.repeat(43),'Content-Type':'application/json'},body:JSON.stringify({observedSites:{albert:{ready:true},unknown:{ready:true}}})}),'/api/agent/vm/worker/claim')
  assert.equal(response.status,200)
  assert.equal(merged,true)
 }finally{globalThis.fetch=originalFetch}
})
