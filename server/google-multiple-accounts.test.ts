import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareCalendarStage,publishCalendarStage,type Stage} from './calendar-staging.js'
import {readGoogleMail} from './google-mail.js'
import {sealVmCredential} from './vm-vault.js'
import {GOOGLE_CALENDAR_SCOPE,GOOGLE_CALENDAR_WRITE_SCOPE,GOOGLE_MAIL_READ_SCOPE,startGoogleCalendar,setGoogleReadEnabled} from './agent.js'

test('multiple account review isolates identical IDs, reads sources, detects source changes, and exposes only read-only mail',async()=>{
 const original=globalThis.fetch
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','CONNECTION_ENCRYPTION_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://multi.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY;process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32);process.env.GOOGLE_CLIENT_ID='client';process.env.GOOGLE_CLIENT_SECRET='secret'
 const primary='ee34ba25-54bc-44df-8515-f7e6784dfed1',school='bb34ba25-54bc-44df-8515-f7e6784dfed1'
 const accounts=[primary,school].map((id,i)=>({id,identity:i?'school@nyu.edu':'personal@gmail.com',read_enabled:true,credentials:sealVmCredential({access_token:i?'school':'personal',scope:[GOOGLE_CALENDAR_SCOPE,GOOGLE_CALENDAR_WRITE_SCOPE,...(i?[GOOGLE_MAIL_READ_SCOPE]:[])].join(' '),expires_at:Date.now()+3600000})}))
 let stage:Stage|null=null,schoolEtag='school-v1',published=0,schoolRead=false,attempt:any
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1)
  if(url.hostname==='multi.test'){
   if(url.searchParams.has('username'))assert.equal(url.searchParams.get('username'),'eq.owner')
   if(table==='planner_google_accounts'){const id=url.searchParams.get('id')?.slice(3);return Response.json(id?accounts.find(a=>a.id===id)||null:accounts)}
   if(table==='planner_vm_settings')return Response.json({google_account_id:primary,sources:['gmail','calendar']})
   if(table==='planner_calendars')return Response.json({revision:4,state:{events:[],tags:[],hiddenTagIds:[]}})
   if(table==='planner_google_fixed_events')return Response.json([])
   if(table==='planner_oauth_attempts'){attempt=await request.json();return new Response(null,{status:201})}
   if(table==='planner_calendar_staging'){
    if(request.method==='GET')return Response.json(stage)
    const update=await request.json() as Partial<Stage>;stage={...(stage as Stage|null),...update} as Stage;return Response.json([{id:stage!.id}])
   }
   if(table==='planner_publish_calendar_stage'){published++;return Response.json(5)}
  }
  if(url.hostname==='www.googleapis.com'){
   assert.equal(request.method,'GET','Source review must never write to Google')
   const isSchool=request.headers.get('Authorization')==='Bearer school';schoolRead ||= isSchool
   return Response.json({items:[{id:'same-id',etag:isSchool?schoolEtag:'personal-v1',summary:isSchool?'School exam':'Personal event'}]})
  }
  if(url.hostname==='gmail.googleapis.com'){
   assert.equal(request.method,'GET');assert.equal(request.headers.get('Authorization'),'Bearer school')
   return Response.json(url.pathname.endsWith('/message')?{id:'message',payload:{mimeType:'text/plain',body:{data:Buffer.from('Exam notice').toString('base64url')},headers:[{name:'Subject',value:'Exam'}]}}:{messages:[{id:'message'}],nextPageToken:'page2'})
  }
  throw Error('Unexpected request '+url.origin+url.pathname)
 }
 try{
  const prepared=await prepareCalendarStage('owner');assert(schoolRead);assert.equal(prepared.sourceAccounts[0].accountId,school);assert.equal(prepared.googleEvents,2)
  assert.equal(stage!.account_id,primary);assert.equal(stage!.payload.google.events[0].summary,'Personal event');assert.equal(stage!.payload.google.sources![0].events[0].summary,'School exam')
  schoolEtag='school-v2'
  await assert.rejects(()=>publishCalendarStage('owner',{id:prepared.id,version:prepared.version,reviewSummary:'Reviewed both accounts and all source events.'}),/Google Calendar changed/);assert.equal(published,0)
  await assert.rejects(()=>setGoogleReadEnabled('owner','cc34ba25-54bc-44df-8515-f7e6784dfed1',true),/not found/)
  await assert.rejects(()=>setGoogleReadEnabled('owner',primary,false),/must also be read/)
  const list=await readGoogleMail('owner',{accountId:school});assert('hasMore' in list);assert.equal(list.hasMore,true);assert.equal(list.nextPageToken,'page2')
  const message=await readGoogleMail('owner',{accountId:school,messageId:'message'});assert('message' in message);assert.equal(message.message.text,'Exam notice')
  await assert.rejects(()=>readGoogleMail('owner',{accountId:primary}),/Connect email/)
  await assert.rejects(()=>readGoogleMail('owner',{accountId:'cc34ba25-54bc-44df-8515-f7e6784dfed1'}),/not found/)
  await startGoogleCalendar('owner',true,true);assert(attempt.requested_scopes.includes(GOOGLE_MAIL_READ_SCOPE));assert(!attempt.requested_scopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE))
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
