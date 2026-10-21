import test from 'node:test'
import assert from 'node:assert/strict'
import {chatWebRelay,chatWebRelayWorker} from './chat-web-relay.js'

test('experimental relay is owner-only and never reads or modifies Agent tables',async()=>{
 process.env.SUPABASE_URL='https://relay.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const original=globalThis.fetch,id='11111111-1111-4111-8111-111111111111'
 const request=(data:unknown)=>new Request('https://planner.test/api/agent/vm/chat-web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  assert.equal(url.pathname,'/rest/v1/planner_chat_web_relay')
  if(req.method!=='POST')assert.equal(url.searchParams.get('username'),'eq.arin')
  if(req.method==='GET')return Response.json(null)
  const body=await req.json() as any
  if(req.method==='POST'){assert.equal(body.username,'arin');assert.equal(body.status,'running');return Response.json({id,...body})}
  assert.equal(url.searchParams.get('lease'),'is.null')
  assert.equal(url.searchParams.get('status'),'eq.running')
  assert.equal(url.searchParams.has('lease_until'),false);return Response.json([{id}])
 }
 try{
  await assert.rejects(()=>chatWebRelay(request({id,message:'test'}),'other'),/only enabled/)
  const response=await chatWebRelay(request({action:'begin',id,message:'test'}),'arin');assert.equal(response.status,202)
  assert.equal((await response.json() as any).message,'test')
  assert.equal((await chatWebRelay(request({action:'finish',id,reply:'reply'}),'arin')).status,200)
  await assert.rejects(()=>chatWebRelayWorker(request({}),'arin','claim'),/VM forwarding is disabled/)
  await assert.rejects(()=>chatWebRelay(request({id,message:'old client'}),'arin'),/device browser extension/)
 }finally{globalThis.fetch=original}
})
