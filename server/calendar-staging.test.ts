import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareCalendarStage,readCalendarStage,editCalendarStage,publishCalendarStage,calendarDownload,assertStageEvent,type Stage} from './calendar-staging.js'
import {sealVmCredential} from './vm-vault.js'
import {GOOGLE_CALENDAR_SCOPE,GOOGLE_CALENDAR_WRITE_SCOPE} from './agent.js'
import {fixedEventPayload} from './fixed-event-payload.js'
import type {CalendarEvent} from '../src/types.js'
test('staging is private to the owner, edits are isolated, conflicts require resolution, stale Google/Planner versions block publish',async()=>{
 process.env.SUPABASE_URL='https://calendar-staging.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY;process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32)
 const original=globalThis.fetch,accountId='ee34ba25-54bc-44df-8515-f7e6784dfed1'
 const event:CalendarEvent={id:'class',title:'Old location',description:'Room 1',start:'2026-11-02T10:00:00-05:00',end:'2026-11-02T11:00:00-05:00',allDay:false,tagIds:[],scheduleType:'fixed',recurrence:{frequency:'weekly',interval:2,until:'2026-12-01'},excludedStarts:['2026-11-16T10:00:00-05:00']}
 let calendar={revision:4,state:{events:[event,{...event,id:'study',scheduleType:'planned'}],tags:[],hiddenTagIds:[]}},stage:Stage|null=null,published=0
 const remote={id:'remote',etag:'v1',...fixedEventPayload({...event,title:'Verified room update'})}
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1),method=request.method
  if(url.hostname==='www.googleapis.com'){assert.equal(method,'GET','Preparing/reviewing/publishing a draft must not directly write Google');return Response.json({items:[remote]})}
  if(url.searchParams.has('username'))assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_vm_settings')return Response.json({google_account_id:accountId})
  if(table==='planner_google_accounts'){const account={id:accountId,identity:'owner@example.com',credentials:sealVmCredential({access_token:'private',scope:GOOGLE_CALENDAR_SCOPE+' '+GOOGLE_CALENDAR_WRITE_SCOPE,expires_at:Date.now()+3600000})};return Response.json(url.searchParams.has('id')?account:[account])}
  if(table==='planner_google_fixed_events')return Response.json([{local_id:'class',remote_id:'remote',managed:false}])
  if(table==='planner_calendars'){assert.equal(method,'GET');return Response.json(calendar)}
  if(table==='planner_calendar_staging'){
   if(method==='GET')return Response.json(stage)
   const update=await request.json() as any
   if(method==='POST')stage=update
   else if(stage)Object.assign(stage,update)
   return Response.json([{id:stage!.id}])
  }
  if(table==='planner_publish_calendar_stage'){
   const args=await request.json() as any
   assert.equal(args.p_username,'owner');assert.equal(args.p_id,stage!.id);assert.equal(args.p_version,stage!.version)
   if(calendar.revision!==stage!.base_revision)return Response.json({message:'Calendar changed'},{status:400})
   calendar={...calendar,revision:calendar.revision+1,state:stage!.payload.calendar as any};stage!.status='approved';stage!.approved_revision=calendar.revision;published++
   return Response.json(calendar.revision)
  }
  throw Error('Unexpected request '+table)
 }
 try{
  const first=await prepareCalendarStage('owner')
  assert.equal(first.status,'draft');assert.equal(calendar.state.events[0].title,'Old location')
  assert.equal(('hasMore' in (await readCalendarStage('owner','google',0,1))),true)
  const download=await calendarDownload('owner',true);assert.equal(download.format,'ai-planner-calendar-stage')
  await assert.rejects(()=>publishCalendarStage('owner',{id:first.id,version:1,reviewSummary:'Reviewed verified room details and recurrence.'}),/Resolve every/)
  const edited=await editCalendarStage('owner',{id:first.id,version:1,events:[{id:'class',title:'Verified room update'}],resolutions:[{issueId:'different:class',decision:'Use the verified Google room update; retain recurrence and original ID.'}]})
  assert.equal(calendar.state.events[0].title,'Old location','Editing staging never changes live state')
  assert.equal(stage!.payload.calendar.events[0].recurrence.interval,2);assert.deepEqual(stage!.payload.calendar.events[0].excludedStarts,event.excludedStarts)
  await assert.rejects(()=>editCalendarStage('owner',{id:first.id,version:1,events:[]}),/current staging/)
  calendar.revision=5
  await assert.rejects(()=>publishCalendarStage('owner',{id:first.id,version:edited.version,reviewSummary:'Reviewed verified room details and recurrence.'}),/Calendar changed/)
  assert.equal(published,0);calendar.revision=4
  remote.etag='v2'
  await assert.rejects(()=>publishCalendarStage('owner',{id:first.id,version:edited.version,reviewSummary:'Reviewed verified room details and recurrence.'}),/Google Calendar changed/)
  assert.equal(published,0);assert.equal(calendar.revision,4)
  const fresh=await prepareCalendarStage('owner',true)
  const fixed=await editCalendarStage('owner',{id:fresh.id,version:1,events:[{id:'class',title:'Verified room update'}],resolutions:[{issueId:'different:class',decision:'Import the verified updated room from Google.'}]})
  const result=await publishCalendarStage('owner',{id:fresh.id,version:fixed.version,reviewSummary:'Reviewed both calendars, recurring exceptions, and imported the verified location update.'})
  assert.equal(result.publishedToPlanner,true);assert.equal(calendar.state.events[0].title,'Verified room update');assert.equal(published,1)
  assert.equal(calendar.state.events[1].id,'study','Unrelated planned work retained')
  assert.doesNotThrow(()=>assertStageEvent(stage!,'remote',remote))
  assert.throws(()=>assertStageEvent(stage!,'remote',{...remote,etag:'newer'}),/changed since review/)
  assert.throws(()=>assertStageEvent(stage!,'new-remote',{id:'new-remote',etag:'new'}),/changed since review/)
 }finally{globalThis.fetch=original}
})
