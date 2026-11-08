import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareCalendarStage,readCalendarStage,editCalendarStage,publishCalendarStage,calendarDownload,assertStageEvent,type Stage} from './calendar-staging.js'
import {sealVmCredential} from './vm-vault.js'
import {GOOGLE_CALENDAR_SCOPE,GOOGLE_CALENDAR_WRITE_SCOPE} from './agent.js'
import {requireNoWidgetDraft} from './widget-draft-lock.js'
import {widgetDraftProblems} from './widget-draft-review.js'
import {fixedEventPayload} from './fixed-event-payload.js'
import type {CalendarEvent,StoredState} from '../src/types.js'
test('staging is private to the owner, edits are isolated, conflicts require resolution, stale Google/Planner versions block publish',async()=>{
 process.env.SUPABASE_URL='https://calendar-staging.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY;process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32)
 const original=globalThis.fetch,accountId='ee34ba25-54bc-44df-8515-f7e6784dfed1'
 const event:CalendarEvent={id:'class',title:'Old location',description:'Room 1',start:'2026-11-02T10:00:00-05:00',end:'2026-11-02T11:00:00-05:00',allDay:false,tagIds:[],scheduleType:'fixed',recurrence:{frequency:'weekly',interval:2,until:'2026-12-01'},excludedStarts:['2026-11-16T10:00:00-05:00']}
 let calendar:{revision:number;state:StoredState}={revision:4,state:{events:[event,{...event,id:'study',scheduleType:'planned'},{...event,id:'rest',title:'Rest',scheduleType:'planned',tagIds:['break'],start:'2026-11-02T11:00:00-05:00',end:'2026-11-02T11:10:00-05:00',recurrence:{frequency:'none',interval:1,until:null}}],tags:[{id:'break',name:'Breaks',color:'#999999'}],hiddenTagIds:[]}},stage:Stage|null=null,published=0,canEdit=false
 const remote={id:'remote',etag:'v1',...fixedEventPayload({...event,title:'Verified room update'})}
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1),method=request.method
  if(url.hostname==='www.googleapis.com'){assert.equal(method,'GET','Preparing/reviewing/publishing a draft must not directly write Google');return Response.json({items:[remote]})}
  if(url.searchParams.has('username'))assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_vm_settings')return Response.json({google_account_id:accountId})
  if(table==='planner_google_accounts'){const account={id:accountId,identity:'owner@example.com',credentials:sealVmCredential({access_token:'private',scope:GOOGLE_CALENDAR_SCOPE+(canEdit?' '+GOOGLE_CALENDAR_WRITE_SCOPE:''),expires_at:Date.now()+3600000})};return Response.json(url.searchParams.has('id')?account:[account])}
  if(table==='planner_google_fixed_events')return Response.json([{local_id:'class',remote_id:'remote',managed:false}])
  if(table==='planner_calendars'){assert.equal(method,'GET');return Response.json(calendar)}
  if(table==='planner_calendar_staging'){
   if(method==='GET')return Response.json(url.searchParams.get('select')?.includes('feedback:')?{status:stage?.status,feedback:stage?.payload.widgetFeedback}:stage)
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
  await assert.rejects(()=>publishCalendarStage('owner',{id:first.id,version:edited.version,reviewSummary:'Review prepared with read-only Google permission.'}),/read-only/)
  assert.equal(published,0);canEdit=true
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
  const widgetId='6ec005dc-2357-4d39-b502-5f94423c52d8'
  const widgetFeedback={id:widgetId,task:{id:'study@'+event.start,title:event.title,start:Date.parse(event.start)/1000,end:Date.parse(event.end)/1000},reportedAt:Date.parse('2026-11-02T10:30:00-05:00')/1000,remainingMinutes:10,done:false}
  const fixed=await editCalendarStage('owner',{id:fresh.id,version:1,widgetFeedback,removeIds:['rest'],removalScope:'event',events:[{id:'class',title:'Verified room update'}],resolutions:[{issueId:'different:class',decision:'Import the verified updated room from Google.'},{issueId:'widget-feedback:'+widgetId,decision:'Reviewed the whole schedule, shortened this study occurrence in the draft and retained all other commitments without introducing overlaps.'}]})
  assert.equal(calendar.state.events.find(e=>e.id==='study')!.end,event.end,'Widget draft never changes a live event')
  assert(calendar.state.events.some(e=>e.id==='rest'),'Draft removal does not remove live breaks yet')
  assert(stage!.payload.calendar.resolvedWidgetFeedbackIds!.includes(widgetId))
  assert.equal((calendar.state as any).resolvedWidgetFeedbackIds,undefined)
  await assert.rejects(()=>requireNoWidgetDraft('owner'),/Keep live calendars unchanged/)
  await assert.rejects(()=>editCalendarStage('owner',{id:fresh.id,version:fixed.version,removeIds:['class']}),/recurring event/)
  const result=await publishCalendarStage('owner',{id:fresh.id,version:fixed.version,reviewSummary:'Reviewed both calendars, recurring exceptions, and imported the verified location update.'})
  await assert.doesNotReject(()=>requireNoWidgetDraft('owner'))
  assert(calendar.state.resolvedWidgetFeedbackIds!.includes(widgetId));assert(!calendar.state.events.some(e=>e.id==='rest'))
  assert.equal(result.publishedToPlanner,true);assert.equal(calendar.state.events[0].title,'Verified room update');assert.equal(published,1)
  assert.equal(calendar.state.events[1].id,'study','Unrelated planned work retained')
  assert.doesNotThrow(()=>assertStageEvent(stage!,'remote',remote))
  assert.throws(()=>assertStageEvent(stage!,'remote',{...remote,etag:'newer'}),/changed since review/)
  assert.throws(()=>assertStageEvent(stage!,'new-remote',{id:'new-remote',etag:'new'}),/changed since review/)
  stage!.status='published' // Simulate the reviewed Google batch finishing before a new draft.
  const cleanup=await prepareCalendarStage('owner',true)
  await editCalendarStage('owner',{id:cleanup.id,version:cleanup.version,removeIds:['study'],removalScope:'series'})
  assert(!stage!.payload.calendar.events.some(e=>e.id==='study'),'Non-break draft removal needs no userConfirmed flag')
  assert(calendar.state.events.some(e=>e.id==='study'),'Draft cleanup still leaves the live calendar intact until publication')
  ;(remote as Record<string,unknown>).status='cancelled'
  const cancelled=await prepareCalendarStage('owner',true)
  const acknowledged=await editCalendarStage('owner',{id:cancelled.id,version:cancelled.version,resolutions:[{issueId:'missing:class',decision:'Keep the historical remote cancellation and retain local history.'}]})
  await assert.rejects(()=>publishCalendarStage('owner',{id:cancelled.id,version:acknowledged.version,reviewSummary:'Reviewed the historical cancellation without choosing resurrection.'}),/googleAction/)
  const resolved=await editCalendarStage('owner',{id:cancelled.id,version:acknowledged.version,resolutions:[{issueId:'missing:class',decision:'Preserve the remote cancellation and retain this local event as history.',googleAction:'preserve_cancelled'}]})
  assert.equal(stage!.payload.googleDecisions?.class,'preserve_cancelled')
  await publishCalendarStage('owner',{id:cancelled.id,version:resolved.version,reviewSummary:'Reviewed the cancelled Google copy; preserve its cancellation without deleting local history.'})

 }finally{globalThis.fetch=original}
})

test('a widget draft cannot publish newly conflicting or duplicate activities',()=>{
 const work:CalendarEvent={id:'work',title:'Homework',description:'',start:'2026-11-02T13:00:00Z',end:'2026-11-02T14:00:00Z',allDay:false,tagIds:[],scheduleType:'planned',recurrence:{frequency:'none',interval:1,until:null}}
 const next={...work,id:'next',title:'Study',start:'2026-11-02T14:00:00Z',end:'2026-11-02T15:00:00Z'}
 const before={events:[work,next],tags:[],hiddenTagIds:[]},feedback=[{id:'feedback',task:{id:work.id,title:work.title,start:Date.parse(work.start)/1000,end:Date.parse(work.end)/1000},reportedAt:Date.parse('2026-11-02T13:30Z')/1000,remainingMinutes:60,done:false}]
 const extended={...work,end:'2026-11-02T14:30:00Z'}
 assert(widgetDraftProblems(before,{...before,events:[extended,next]},feedback).some(message=>message.includes('overlap')))
 assert.deepEqual(widgetDraftProblems(before,{...before,events:[extended,{...next,start:'2026-11-02T14:30:00Z',end:'2026-11-02T15:30:00Z'}]},feedback),[])
 assert(widgetDraftProblems(before,{...before,events:[work,{...work,id:'duplicate'},next]},feedback).some(message=>message.includes('Duplicate')))
})
