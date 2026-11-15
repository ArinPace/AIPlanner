import test from 'node:test'
import assert from 'node:assert/strict'
import {handleSubscriptionChat} from './subscription-chat.js'
const chat='a1111111-1111-4111-8111-111111111111',turn='b1111111-1111-4111-8111-111111111111'
test('resumption requires an owned current receipt and an unexpired running tool turn; never writes',async()=>{
 const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://resume.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let status='submitted',toolStatus='running',expires=Date.now()+60000,archived=false,deleted:string|null=null
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  assert.equal(req.method,'GET');assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_subscription_chats')return Response.json(url.searchParams.get('id')==='eq.'+chat?{id:chat,archived,deleted_at:deleted}:null)
  assert.equal(url.searchParams.get('chat_id'),'eq.'+chat);assert.equal(url.searchParams.get('id'),'eq.'+turn)
  if(table==='planner_subscription_attempts')return Response.json(status==='missing'?null:{status})
  assert.equal(table,'planner_subscription_tool_turns');return Response.json(toolStatus==='missing'?null:{status:toolStatus,expires_at:new Date(expires).toISOString()})
 }
 const call=async(extra={})=>(await handleSubscriptionChat(new Request('https://planner.test/api/subscription-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'relay_resume_check',chatId:chat,turnId:turn,...extra})}),'owner')).json() as Promise<{canResume:boolean}>
 try{
  assert.equal((await call()).canResume,true);status='started';assert.equal((await call()).canResume,true)
  for(const value of ['missing','completed','failed','interrupted']){status=value;assert.equal((await call()).canResume,false)}
  status='submitted'
  for(const value of ['missing','completed','cancelled']){toolStatus=value;assert.equal((await call()).canResume,false)}
  toolStatus='running';expires=Date.now()-1000;assert.equal((await call()).canResume,false)
  expires=Date.now()+60000;archived=true;assert.equal((await call()).canResume,false)
  archived=false;deleted=new Date().toISOString();assert.equal((await call()).canResume,false)
  deleted=null;await assert.rejects(()=>call({chatId:'c1111111-1111-4111-8111-111111111111'}),/Chat not found/)
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
