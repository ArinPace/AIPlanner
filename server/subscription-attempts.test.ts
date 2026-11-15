import test from 'node:test'
import assert from 'node:assert/strict'
import {subscriptionAttemptAction} from './subscription-attempts.js'
test('attempt receipts are owner-scoped, idempotent, and terminal states cannot be overwritten',async()=>{
 const savedFetch=globalThis.fetch,savedEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,secret:process.env.SUPABASE_SECRET_KEY}
 process.env.SUPABASE_URL='https://attempts.test';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';delete process.env.SUPABASE_SECRET_KEY
 const chat='a1111111-1111-4111-8111-111111111111',turn='b1111111-1111-4111-8111-111111111111',other='c1111111-1111-4111-8111-111111111111'
 const rows:any[]=[];let writes=0
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(table==='planner_subscription_chats'){assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json(url.searchParams.get('id')==='eq.'+chat?{id:chat,archived:false,deleted_at:null}:null)}
  assert.equal(table,'planner_subscription_attempts')
  const row=rows.find(item=>item.id===url.searchParams.get('id')?.slice(3)&&item.chat_id===chat&&item.username==='owner')
  if(req.method==='GET'){assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json(row||null)}
  if(req.method==='POST'){const data=await req.json() as any;assert.equal(data.username,'owner');writes++;const fresh={...data,status:'started',detail:'',partial_reply:'',submitted_at:null,created_at:'2026-11-15T00:00:00Z',updated_at:'2026-11-15T00:00:00Z'};rows.push(fresh);return Response.json(fresh)}
  assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(url.searchParams.get('chat_id'),'eq.'+chat);assert.equal(url.searchParams.get('status'),'in.(started,submitted)');writes++;Object.assign(row,await req.json());return Response.json(row)
 }
 const call=(action:string,extra={})=>subscriptionAttemptAction('owner',{action,chatId:chat,turnId:turn,...extra})
 try{
  await assert.rejects(()=>call('relay_attempt_start',{chatId:other,prompt:'Question'}),/owned chat/)
  await assert.rejects(()=>call('relay_attempt_update',{status:'failed'}),/not found/)
  const started=await call('relay_attempt_start',{prompt:'Question'});assert.equal(started.status,'started');assert.equal(writes,1)
  await call('relay_attempt_start',{prompt:'Question'});assert.equal(writes,1)
  await assert.rejects(()=>call('relay_attempt_start',{prompt:'Different question'}),/another message/)
  const submitted=await call('relay_attempt_update',{status:'submitted'});assert.ok(submitted.submitted_at)
  const failed=await call('relay_attempt_update',{status:'failed',detail:'Interrupted during sign-in',partialReply:'A partial answer'});assert.equal(failed.partial_reply,'A partial answer');assert.ok(failed.submitted_at)
  const priorWrites=writes;await call('relay_attempt_update',{status:'submitted'});assert.equal(writes,priorWrites);assert.equal(rows[0].status,'failed')
  rows[0].status='completed';await call('relay_attempt_update',{status:'failed'});assert.equal(writes,priorWrites);assert.equal(rows[0].status,'completed')
 }finally{globalThis.fetch=savedFetch;for(const [key,value] of Object.entries({SUPABASE_URL:savedEnv.url,SUPABASE_SERVICE_ROLE_KEY:savedEnv.key,SUPABASE_SECRET_KEY:savedEnv.secret})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
