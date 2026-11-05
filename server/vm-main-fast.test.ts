import test from 'node:test'
import assert from 'node:assert/strict'
import {handleVmRequest} from './vm.js'
test('Main transcript opens independently of VM, Google, Files and Tutor maintenance with eight recent turns',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://main-fast.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const id='11111111-1111-4111-8111-111111111111';let missing=false
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1)
  if(table==='planner_ensure_main_chat'){assert.deepEqual(await request.json(),{p_username:'owner'});return Response.json(id)}
  assert.equal(request.method,'GET');assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_vm_chats')return Response.json(missing?null:{id,title:'Main Chat',is_main:true})
  if(table==='planner_vm_jobs'){assert(!url.searchParams.get('select')?.split(',').includes('result'));assert.equal(url.searchParams.get('limit'),'9');return Response.json(Array.from({length:9},(_,i)=>({id:'job-'+i,kind:i===0?'sync':'chat',status:'completed',message:i===0?'PRIVATE REVIEW PROMPT':'hello',reply:'Reply '+i,result:{heavyInternal:'PRIVATE_HEAVY_METADATA'},created_at:new Date(2026,0,20-i).toISOString()})))}
  throw Error('Fast transcript must not touch '+table)
 }
 try{const response=await handleVmRequest(new Request('https://planner.test/api/agent/vm/main'),'/api/agent/vm/main','owner'),value=await response.json() as any;assert.equal(value.chat.id,id);assert.equal(value.jobs.length,8);assert.equal(value.hasMore,true);assert.equal(value.jobs.at(-1).message,'Scheduled calendar review');assert(!JSON.stringify(value).includes('PRIVATE REVIEW PROMPT'));assert(!JSON.stringify(value).includes('PRIVATE_HEAVY_METADATA'));missing=true;await assert.rejects(()=>handleVmRequest(new Request('https://planner.test/api/agent/vm/main'),'/api/agent/vm/main','owner'),/not found/)}finally{globalThis.fetch=old;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
})
