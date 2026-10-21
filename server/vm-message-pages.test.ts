import test from 'node:test'
import assert from 'node:assert/strict'
import {handleVmRequest} from './vm.js'

test('chat pages are bounded, owner scoped and hide scheduled instructions without changing stored prompts',async()=>{
 process.env.SUPABASE_URL='https://pages.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const original=globalThis.fetch,chat='11111111-1111-4111-8111-111111111111',cursor='22222222-2222-4222-8222-222222222222'
 let older=false
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  assert.equal(req.method,'GET');assert.equal(url.searchParams.get('username'),'eq.owner')
  if(url.pathname.endsWith('planner_vm_chats'))return Response.json({id:chat})
  if(url.pathname.endsWith('planner_vm_jobs')){
   assert.equal(url.searchParams.get('chat_id'),'eq.'+chat)
   if(url.searchParams.get('id'))return Response.json({id:cursor,created_at:'2026-10-21T00:00:00+00:00'})
   assert.equal(url.searchParams.get('limit'),'21')
   assert.equal(Boolean(url.searchParams.get('or')),older)
   assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc')
   return Response.json(Array.from({length:21},(_,i)=>({id:String(i),kind:i===0?'sync':'chat',status:'completed',message:i===0?'INTERNAL FULL REVIEW INSTRUCTIONS':'hello',created_at:new Date(2026,0,22-i).toISOString()})))
  }
  throw Error('Unexpected route')
 }
 try{
  for(const before of['',cursor]){
   older=Boolean(before)
   const response=await handleVmRequest(new Request('https://planner.test/api/agent/vm/messages?chat='+chat+(before?'&before='+before:'')),'/api/agent/vm/messages','owner')
   const result=await response.json() as any
   assert.equal(result.jobs.length,20);assert.equal(result.hasMore,true)
   assert.equal(result.jobs.at(-1).message,'Scheduled calendar review')
   assert.equal(result.jobs[0].message,'hello')
  }
 }finally{globalThis.fetch=original}
})
