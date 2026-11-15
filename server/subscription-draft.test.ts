import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {handleSubscriptionChat} from './subscription-chat.js'
import {toolTurnMessage,unsentRelayRequest} from '../src/lib/subscriptionTools.js'
const chat='a1111111-1111-4111-8111-111111111111',turn='b1111111-1111-4111-8111-111111111111'
test('draft recognition requires a generated receipt and preserves the original request',()=>{
 const prompt='Can you read my course messages?'
 const envelope='[Planner relay receipt: '+turn+']\n'+toolTurnMessage(prompt,turn,'Fixture integration instructions')
 assert.deepEqual(unsentRelayRequest(envelope),{turnId:turn,prompt})
 for(const value of [prompt,'fixture@example.invalid','password',toolTurnMessage(prompt,turn),'[Planner relay receipt: '+turn+']\nIncomplete request'])assert.equal(unsentRelayRequest(value),null)
})
test('only verified inactive drafts in the owned chat can be recovered; preserve history idempotently',async()=>{
 const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://draft.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let status='cancelled',archived=false,rows:any[]=[]
 const prompt='Can you read my course messages?',stamp='2026-11-14T01:00:00Z'
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(table==='planner_subscription_chats'){assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json(url.searchParams.get('id')==='eq.'+chat?{id:chat,archived,deleted_at:null}:null)}
  if(table==='planner_subscription_tool_turns'){
   assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(url.searchParams.get('chat_id'),'eq.'+chat);assert.equal(url.searchParams.get('id'),'eq.'+turn)
   return Response.json(status==='missing'?null:{id:turn,status,prompt_digest:createHash('sha256').update(prompt).digest('hex'),created_at:stamp})
  }
  assert.equal(table,'planner_subscription_attempts');assert.equal(req.method,'POST');assert.match(req.headers.get('prefer')||'',/ignore-duplicates/)
  const data=await req.json() as any;assert.equal(data.username,'owner');assert.equal(data.chat_id,chat);assert.equal(data.prompt,prompt);assert.equal(data.created_at,stamp);assert.equal(data.status,'interrupted');if(!rows.some(r=>r.id===data.id))rows.push(data)
  return new Response(null,{status:201})
 }
 const call=async(extra={})=>(await handleSubscriptionChat(new Request('https://planner.test/api/subscription-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'relay_draft_check',chatId:chat,turnId:turn,prompt,...extra})}),'owner')).json() as Promise<{safeToClear:boolean}>
 try{
  await assert.rejects(()=>call({chatId:'c1111111-1111-4111-8111-111111111111'}),/Chat not found/)
  for(const mode of ['missing','running']){status=mode;assert.equal((await call()).safeToClear,false)}
  status='cancelled';assert.equal((await call({prompt:'Unrelated manual text'})).safeToClear,false);assert.equal(rows.length,0)
  assert.equal((await call()).safeToClear,true);assert.equal((await call()).safeToClear,true);assert.equal(rows.length,1)
  status='completed';assert.equal((await call()).safeToClear,true);assert.equal(rows.length,1)
  archived=true;await assert.rejects(()=>call(),/Restore this chat/)
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
