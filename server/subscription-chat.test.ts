import test from 'node:test'
import assert from 'node:assert/strict'
import {handleSubscriptionChat} from './subscription-chat.js'
test('subscription workspace is fresh and owner-scoped; never touches Agent jobs or old relay chats',async()=>{
 const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://subscription.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const main='a1111111-1111-4111-8111-111111111111',extra='b1111111-1111-4111-8111-111111111111',foreign='c1111111-1111-4111-8111-111111111111'
 const chats:any[]=[];let requests=0;const tables:string[]=[]
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1);requests++;tables.push(table||'')
  if(table==='planner_sync_subscription_tutors'){assert.equal((await req.json() as any).p_username,'owner');return Response.json({count:0})}
  assert(!['planner_vm_jobs','planner_vm_hosts','planner_device_chats','planner_chat_web_relay'].includes(table||''),'New Chat cannot access VM jobs or legacy Chat data')
  if(req.method==='GET')assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_vm_settings')return Response.json({sources:[],google_account_id:null})
  if(table==='planner_google_accounts')return Response.json([])
  if(table==='planner_subscription_messages')return Response.json([])
  if(table==='planner_subscription_chats'){
   if(req.method==='POST'){const data=await req.json() as any;assert.equal(data.username,'owner');const row={...data,id:data.is_main?main:extra,archived:false,deleted_at:null,updated_at:'2026-11-03T00:00:00Z'};chats.push(row);return Response.json(row)}
   if(req.method==='PATCH'){assert.equal(url.searchParams.get('username'),'eq.owner');const row=chats.find(c=>c.id===url.searchParams.get('id')?.slice(3));Object.assign(row,await req.json());return Response.json(row)}
   if(url.searchParams.has('is_main'))return Response.json(chats.find(c=>c.is_main)||null)
   if(url.searchParams.has('id'))return Response.json(chats.find(c=>c.id===url.searchParams.get('id')?.slice(3))||null)
   return Response.json(chats)
  }
  throw Error('Unexpected table '+table)
 }
 const post=(input:any)=>handleSubscriptionChat(new Request('https://planner.test/api/subscription-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),'owner')
 try{
  const response=await handleSubscriptionChat(new Request('https://planner.test/api/subscription-chat'),'owner'),data=await response.json() as any
  assert.equal(data.chat.id,main);assert.equal(data.connection.connected,false);assert.deepEqual(data.messages,[]);assert.equal(data.chats.length,1)
  const mark=tables.length;await handleSubscriptionChat(new Request('https://planner.test/api/subscription-chat?fast=1'),'owner');assert(!tables.slice(mark).some(t=>['planner_sync_subscription_tutors','planner_vm_settings','planner_google_accounts'].includes(t)),'Fast subscription transcript must not wait on Tutor or Google settings')
  await assert.rejects(()=>handleSubscriptionChat(new Request('https://planner.test/api/subscription-chat?chat='+foreign),'owner'),/not found/)
  const created=await (await post({action:'create'})).json() as any;assert.equal(created.id,extra)
  const renamed=await (await post({action:'update',id:extra,title:'Independent Chat'})).json() as any;assert.equal(renamed.title,'Independent Chat')
  await assert.rejects(()=>post({action:'update',id:main,pinned:false}),/stays pinned/)
  await post({action:'relay_bind',chatId:extra,url:'https://chatgpt.com/c/test-mapped'})
  await assert.rejects(()=>post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:created.updated_at,url:'https://chatgpt.com/c/another',observed:{title:'Independent Chat',archived:false,deleted:false}}),/link changed/)
  await assert.rejects(()=>post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:'old',url:'https://chatgpt.com/c/test-mapped',observed:{title:'Independent Chat',archived:false,deleted:false}}),/chat changed/)
  const plan=await (await post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:renamed.updated_at,url:'https://chatgpt.com/c/test-mapped',observed:{title:'Auto title',archived:false,deleted:false}})).json() as any
  assert.deepEqual(plan.plan.push,{title:'Independent Chat'})
  const ack=await (await post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:renamed.updated_at,url:'https://chatgpt.com/c/test-mapped',observed:{title:'Auto title',archived:false,deleted:false},applied:{title:'Independent Chat',archived:false,deleted:false}})).json() as any
  assert.deepEqual(ack.provider_snapshot,{title:'Independent Chat',archived:false,deleted:false})
  const pull=await (await post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:ack.updated_at,url:'https://chatgpt.com/c/test-mapped',observed:{title:'Renamed on ChatGPT',archived:true,deleted:false}})).json() as any
  assert.deepEqual(pull.plan.pull,{title:'Renamed on ChatGPT',archived:true})
  await assert.rejects(()=>post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:ack.updated_at,url:'https://chatgpt.com/c/test-mapped',observed:{title:'Renamed on ChatGPT',archived:true,deleted:false},applied:{title:'Unverified',archived:true,deleted:false}}),/not verified/)
  const deleted=await (await post({action:'relay_mirror',chatId:extra,expectedUpdatedAt:ack.updated_at,url:'https://chatgpt.com/c/test-mapped',observed:{title:'Independent Chat',archived:false,deleted:true},applied:{title:'Independent Chat',archived:false,deleted:true}})).json() as any
  assert(deleted.deleted_at)
  const restored=await (await post({action:'update',id:extra,deleted:false})).json() as any
  assert.equal(restored.provider_url,null);assert.equal(restored.provider_snapshot,null)
  const before=requests
  await assert.rejects(()=>post({action:'send',chatId:extra,message:'Hello'}),/subscription sign-in is not configured/)
  await assert.rejects(()=>post({action:'connect'}),/approved Sign in/)
  assert.equal(requests,before,'Unconfigured send/connect cannot invoke any runtime or mutate messages')
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
