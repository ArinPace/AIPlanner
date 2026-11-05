import test from 'node:test'
import assert from 'node:assert/strict'
import {subscriptionScheduleAction,subscriptionScheduleSettings} from './subscription-schedule.js'
import {scheduledReviewMessage} from './vm-power.js'
test('Chat reviews stay held until explicit readiness, scope claims to owner Main, and deduplicate slots',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://schedule.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const parts=new Intl.DateTimeFormat('en',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),time=parts.find(p=>p.type==='hour')!.value+':'+parts.find(p=>p.type==='minute')!.value
 let row:any={agent_hidden:true,subscription_schedule_enabled:false,subscription_schedule:{timezone:'America/New_York',times:[time]},updated_at:'2026-01-01T00:00:00Z'},claims=0,finished=false
 const main='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222'
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(req.method==='GET'||req.method==='PATCH')assert.equal(url.searchParams.get('username'),'eq.clone')
  if(table==='planner_vm_settings'){
   if(req.method==='GET')return Response.json(row)
   const data=await req.json() as any;if(req.method==='POST'){assert.equal(data.username,'clone');return new Response(null,{status:201})}
   assert.equal(url.searchParams.get('updated_at'),'eq.'+row.updated_at);row={...row,...data};return Response.json([{username:'clone'}])
  }
  if(table==='planner_subscription_chats')return Response.json(url.searchParams.get('id')==='eq.'+main?{is_main:true,archived:false,deleted_at:null}:null)
  if(table==='planner_subscription_reviews'){
   const data=await req.json() as any;if(req.method==='POST'){assert.equal(data.username,'clone');claims++;return claims===1?Response.json({id:run}):Response.json({code:'23505',message:'duplicate'},{status:409})}
   assert.equal(url.searchParams.get('id'),'eq.'+run);assert.equal(url.searchParams.get('status'),'eq.claimed');assert.equal(data.status,'completed');finished=true;return new Response(null,{status:204})
  }
  throw Error('Unexpected request '+table)
 }
 try{
  const original=await subscriptionScheduleSettings('clone');assert.equal(original.enabled,false);assert.equal(original.execution,'foreground')
  assert.deepEqual(await subscriptionScheduleAction('clone',{action:'schedule_claim',chatId:main,ready:true}),{due:false});assert.equal(claims,0)
  await assert.rejects(()=>subscriptionScheduleAction('clone',{action:'schedule_update',expectedUpdatedAt:original.updatedAt,enabled:true}),/sign-ins/)
  await assert.rejects(()=>subscriptionScheduleAction('clone',{action:'schedule_update',expectedUpdatedAt:'stale',enabled:false}),/changed/)
  await subscriptionScheduleAction('clone',{action:'schedule_update',expectedUpdatedAt:original.updatedAt,enabled:true,signInsReady:true})
  await assert.rejects(()=>subscriptionScheduleAction('clone',{action:'schedule_claim',chatId:run,ready:true}),/Main Chat/)
  const due=await subscriptionScheduleAction('clone',{action:'schedule_claim',chatId:main,ready:true}) as any;assert.equal(due.due,true);assert.match(due.prompt,/Task progress/);assert.equal(due.label,'Scheduled planner review')
  assert.deepEqual(await subscriptionScheduleAction('clone',{action:'schedule_claim',chatId:main,ready:true}),{due:false})
  await subscriptionScheduleAction('clone',{action:'schedule_finish',runId:run,completed:true});assert(finished)
  assert.match(scheduledReviewMessage({timezone:'America/New_York',times:[time]}),/Never mark work complete.*merely because time elapsed/)
 }finally{globalThis.fetch=old;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
})
