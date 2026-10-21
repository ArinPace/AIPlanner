import test from 'node:test'
import assert from 'node:assert/strict'
import {chatWebRelay,chatWebRelayWorker} from './chat-web-relay.js'

test('experimental relay is owner-only and never reads or modifies Agent tables',async()=>{
 process.env.SUPABASE_URL='https://relay.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const original=globalThis.fetch,id='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222'
 const request=(data:unknown)=>new Request('https://planner.test/api/agent/vm/chat-web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  assert.equal(url.pathname,'/rest/v1/planner_chat_web_relay')
  if(req.method!=='POST')assert.equal(url.searchParams.get('username'),'eq.arin')
  if(req.method==='GET')return Response.json(null)
  const body=await req.json() as any
  if(req.method==='POST'){assert.equal(body.username,'arin');return Response.json({id,...body,status:'queued'})}
  assert.equal(url.searchParams.get('lease'),'eq.'+lease)
  assert.equal(url.searchParams.get('status'),'eq.running')
  assert.ok(url.searchParams.has('lease_until'));return Response.json([{id}])
 }
 try{
  await assert.rejects(()=>chatWebRelay(request({id,message:'test'}),'other'),/only enabled/)
  const response=await chatWebRelay(request({id,message:'test'}),'arin');assert.equal(response.status,202)
  assert.equal((await response.json() as any).message,'test')
  assert.equal((await chatWebRelayWorker(request({id,lease,reply:'reply'}),'arin','finish')).status,200)
 }finally{globalThis.fetch=original}
})
