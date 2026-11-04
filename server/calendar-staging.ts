import {withSourceHealth} from './source-health.js'
import {resizeWidgetOccurrence,verifyFreeTimeRequest,type TaskFeedback} from '../src/lib/widgetTaskFeedback.js'
import {widgetDraftProblems} from './widget-draft-review.js'
import {removeCalendarItems} from './planner-control.js'
import {randomUUID,createHash} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {calendarRow,eventPatch} from './planner-workspace.js'
import {googleCalendarSession,googleCalendarStatus} from './agent.js'
import {fixedEventPayload} from './fixed-event-payload.js'
import {eventType} from '../src/lib/eventType.js'
import {normalizeEventFolders,validateEventFolders} from '../src/lib/eventFolders.js'
import type {CalendarEvent,StoredState} from '../src/types.js'

const base='https://www.googleapis.com/calendar/v3/calendars/primary/events'
type Remote=Record<string,any>
export type Stage={username:string;id:string;version:number;base_revision:number;account_id:string;status:string;approved_revision:number|null;review_summary?:string;payload:{calendar:StoredState;google:{events:Remote[];mappings:Remote[];timeMin:string;timeMax:string;sources?:{accountId:string;identity:string;events:Remote[]}[]};issues:{id:string;message:string}[];resolutions:Record<string,string>;googleDecisions?:Record<string,'restore'|'preserve_cancelled'>;widgetFeedback?:TaskFeedback[]}}
export {STAGED_CALENDAR_RULES} from './calendar-staging-rules.js'
export function sameGoogleEvent(a:Remote,b:Remote){
 const time=(v:any)=>v?.date|| (v?.dateTime?new Date(v.dateTime).toISOString():null)
 return (a.summary||'')===(b.summary||'')&&(a.description||'')===(b.description||'')&&time(a.start)===time(b.start)&&time(a.end)===time(b.end)&&JSON.stringify([...(a.recurrence||[])].sort())===JSON.stringify([...(b.recurrence||[])].sort())
}
function snapshotKey(events:Remote[]){return createHash('sha256').update(JSON.stringify(events.map(e=>[e.id,e.etag,e.status]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex')}
export async function stagingRow(username:string){return storage(await db().from('planner_calendar_staging').select('*').eq('username',username).maybeSingle()) as Stage|null}
function reviewSnapshotKey(google:Stage['payload']['google']){return JSON.stringify([snapshotKey(google.events),...(google.sources||[]).map(source=>[source.accountId,snapshotKey(source.events)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])}
export function sourceCalendarIssues(calendar:StoredState,sources:NonNullable<Stage['payload']['google']['sources']>){
 return sources.flatMap(source=>stageIssues(calendar,{events:source.events,mappings:[],timeMin:'',timeMax:''}).filter(issue=>issue.id.startsWith('google-overlap:')).map(issue=>({...issue,id:'source:'+source.accountId+':'+issue.id,message:source.identity+': '+issue.message})))
}
async function googleSnapshot(username:string,window?:{timeMin:string;timeMax:string}){
 return withSourceHealth(username,'calendar','staging',()=>googleSnapshotUnchecked(username,window))
}
async function googleSnapshotUnchecked(username:string,window?:{timeMin:string;timeMax:string}){
 const session=await googleCalendarSession(username,undefined,true)
 const mappings=storage(await db().from('planner_google_fixed_events').select('*').eq('username',username).eq('account_id',session.accountId))
 const local=await calendarRow(username)
 const fixed=local.state.events.filter(e=>e.eventKind!=='folder'&&eventType(e,local.state.tags)==='fixed')
 const bounds=window?{timeMin:window.timeMin,timeMax:window.timeMax}:{timeMin:new Date(Math.min(Date.now()-30*86400000,...fixed.map(e=>Date.parse(e.start)-86400000))).toISOString(),timeMax:new Date(Math.max(Date.now()+366*86400000,...fixed.map(e=>Date.parse(e.end)+86400000))).toISOString()}
 const events:Remote[]=[],deadline=Date.now()+22000
 const read=async(url:string)=>{if(Date.now()>deadline)throw new ApiError(503,'Google snapshot is incomplete. Retry preparation; nothing was published.');const r=await fetch(url,{headers:{Authorization:'Bearer '+session.tokens.access_token},signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});if(r.status===404||r.status===410)return null;if(!r.ok)throw new ApiError(502,'Could not read Google Calendar for staging ('+r.status+'). Nothing was published.');return r.json() as Promise<Remote>}
 const params=new URLSearchParams({...bounds,maxResults:'2500',singleEvents:'false',showDeleted:'true'})
 let page:string|undefined
 do{if(page)params.set('pageToken',page);const result=await read(base+'?'+params);if(!result)throw new ApiError(502,'Google snapshot unavailable.');events.push(...(result.items||[]));page=result.nextPageToken;if(events.length>10000)throw new ApiError(413,'Google review window is too large; no partial snapshot was saved.')}while(page)
 // Exact linked masters/occurrences must be reviewed even outside the window.
 for(const mapping of mappings)if(!events.some(e=>e.id===mapping.remote_id)){const event=await read(base+'/'+encodeURIComponent(mapping.remote_id));events.push(event||{id:mapping.remote_id,status:'cancelled',etag:null})}
 const status=await googleCalendarStatus(username)
 const sources:NonNullable<Stage['payload']['google']['sources']>=[]
 for(const account of status.accounts.filter(a=>a.id!==session.accountId&&a.readEnabled)){
  if(!account.connected)throw new ApiError(409,'Reconnect '+account.identity+' or disable its calendar source before reviewing.')
  const grant=await googleCalendarSession(username,account.id)
  const sourceEvents:Remote[]=[],query=new URLSearchParams({...bounds,maxResults:'2500',singleEvents:'false',showDeleted:'true'})
  let next:string|undefined
  do{
   if(Date.now()>deadline)throw new ApiError(503,'Google multi-account snapshot is incomplete. Retry; no partial review was saved.')
   if(next)query.set('pageToken',next)
   const response=await fetch(base+'?'+query,{headers:{Authorization:'Bearer '+grant.tokens.access_token},signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))})
   if(!response.ok)throw new ApiError(502,'Could not read '+account.identity+' calendar ('+response.status+'). Reconnect it or disable this source; no partial review was saved.')
   const data=await response.json() as Remote
   sourceEvents.push(...(data.items||[]));next=data.nextPageToken
   if(sourceEvents.length>10000)throw new ApiError(413,'Source calendar is too large for a complete review.')
  }while(next)
  sources.push({accountId:account.id,identity:account.identity,events:sourceEvents})
 }
 return {accountId:session.accountId,identity:session.identity,google:{...bounds,events,mappings,sources}}
}
export function stageIssues(calendar:StoredState,google:Stage['payload']['google']){
 const issues:Stage['payload']['issues']=[]
 const fixed=calendar.events.filter(e=>e.eventKind!=='folder'&&eventType(e,calendar.tags)==='fixed')
 for(const mapping of google.mappings){
  const event=fixed.find(e=>e.id===mapping.local_id),remote=google.events.find(e=>e.id===mapping.remote_id)
  if(!event)issues.push({id:'removed:'+mapping.local_id,message:'Local fixed event was removed or reclassified. Review authorized removal; original adopted Google events are preserved.'})
  else if(!remote||remote.status==='cancelled')issues.push({id:'missing:'+event.id,message:'Linked Google event is missing/cancelled. Decide whether the commitment should be restored or the internal plan corrected.'})
  else if(!sameGoogleEvent(fixedEventPayload(event),remote))issues.push({id:'different:'+event.id,message:'Planner and linked Google event differ. Review both; preserve verified manual edits rather than choosing a side blindly.'})
 }
 const linked=new Set(google.mappings.map(m=>m.remote_id))
 for(const remote of google.events.filter(e=>!linked.has(e.id)&&e.status!=='cancelled')){
  const start=remote.start?.dateTime,end=remote.end?.dateTime
  if(!start||!end)continue
  for(const event of fixed.filter(e=>!e.allDay&&!e.reminder)){
   if(Date.parse(event.start)>=Date.parse(end)||Date.parse(event.end)<=Date.parse(start))continue
   const sameTime=Date.parse(event.start)===Date.parse(start)&&Date.parse(event.end)===Date.parse(end)
   if(sameTime&&sameGoogleEvent(fixedEventPayload(event),remote))continue
   issues.push({id:'google-overlap:'+event.id+':'+remote.id,message:'An unlinked Google event overlaps this fixed base event: '+event.title+' / '+(remote.summary||remote.id)+'. Reconcile duplicates, details, or actual timing conflicts before publishing.'})
  }
 }
 // This check covers base times only; the agent must review expanded recurrence.
 const timed=fixed.filter(e=>!e.allDay&&!e.reminder).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))
 for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length&&Date.parse(timed[j].start)<Date.parse(timed[i].end);j++)issues.push({id:'overlap:'+timed[i].id+':'+timed[j].id,message:'Fixed base event times overlap: '+timed[i].title+' / '+timed[j].title+'. Check actual occurrences and whether this is intentional.'})
 return issues
}
export async function prepareCalendarStage(username:string,refresh=false){
 const [row,old]=await Promise.all([calendarRow(username),stagingRow(username)])
 if(!refresh&&old?.status==='draft'&&old.base_revision===row.revision)return stageSummary(old)
 if(old?.status==='approved'&&old.approved_revision===row.revision)throw new ApiError(409,'The reviewed batch is still being published. Read sync status before preparing another draft.')
 const snapshot=await googleSnapshot(username)
 const stage:Stage={username,id:randomUUID(),version:1,base_revision:row.revision,account_id:snapshot.accountId,status:'draft',approved_revision:null,payload:{calendar:row.state,google:snapshot.google,issues:[...stageIssues(row.state,snapshot.google),...sourceCalendarIssues(row.state,snapshot.google.sources||[])],resolutions:{}}}
 const saved=old?await db().from('planner_calendar_staging').update(stage).eq('username',username).eq('id',old.id).eq('version',old.version).eq('status',old.status).select('id'):await db().from('planner_calendar_staging').insert(stage).select('id')
 if(!storage(saved)?.length)throw new ApiError(409,'Staging changed while preparing. Read it again.')
 return stageSummary(stage)
}
function stageSummary(stage:Stage){return {id:stage.id,version:stage.version,status:stage.status,baseRevision:stage.base_revision,approvedRevision:stage.approved_revision,accountId:stage.account_id,issues:stage.payload.issues,resolutions:stage.payload.resolutions,calendarEvents:stage.payload.calendar.events.length,googleEvents:stage.payload.google.events.length+(stage.payload.google.sources||[]).reduce((n,s)=>n+s.events.length,0),sourceAccounts:(stage.payload.google.sources||[]).map(({accountId,identity,events})=>({accountId,identity,events:events.length,readOnly:true})),widgetFeedback:stage.payload.widgetFeedback||[],googleDecisions:stage.payload.googleDecisions||{},googleWindow:{timeMin:stage.payload.google.timeMin,timeMax:stage.payload.google.timeMax},coverage:'Google series/occurrences in the stated window plus every linked Google event; overlap hints cover base times only. Review recurrence and all sources explicitly.',download:'/api/calendar/staging.json'}}
export async function readCalendarStage(username:string,section='summary',offset=0,limit=100){
 const stage=await stagingRow(username);if(!stage)throw new ApiError(404,'Prepare a calendar draft first.')
 const items=section==='google'?[...stage.payload.google.events.map(e=>({...e,accountId:stage.account_id,exportTarget:true})),...(stage.payload.google.sources||[]).flatMap(source=>source.events.map(e=>({...e,accountId:source.accountId,accountIdentity:source.identity,exportTarget:false})))]:stage.payload.calendar.events
 return section==='summary'?{...stageSummary(stage),tags:stage.payload.calendar.tags,mappings:stage.payload.google.mappings}:{...stageSummary(stage),items:items.slice(offset,offset+limit),total:items.length,offset,hasMore:offset+limit<items.length}
}
export const widgetFeedbackSchema=z.object({id:z.string().uuid(),task:z.object({id:z.string().min(1).max(500),title:z.string().max(300),start:z.number().finite(),end:z.number().finite(),planningTaskId:z.string().max(100).optional(),sourceEventId:z.string().max(100).optional()}),remainingMinutes:z.number().int().nonnegative(),done:z.boolean(),reportedAt:z.number().finite(),requestedEnd:z.number().finite().optional(),kind:z.literal('fillFreeTime').optional()})
const draftPatch=z.object(eventPatch).omit({revision:true,activityType:true,bufferForEventId:true,planningLocked:true})
export async function editCalendarStage(username:string,args:{id:string;version:number;events?:unknown[];widgetFeedback?:unknown;removeIds?:string[];removalScope?:'event'|'series'|'occurrence';occurrenceStart?:string;userConfirmed?:boolean;resolutions?:{issueId:string;decision:string;googleAction?:'restore'|'preserve_cancelled'}[]}){
 const stage=await stagingRow(username)
 if(!stage||stage.id!==args.id||stage.version!==args.version||stage.status!=='draft')throw new ApiError(409,'Read the current staging ID/version before editing.')
 if((await calendarRow(username)).revision!==stage.base_revision)throw new ApiError(409,'Live calendar changed. Prepare a fresh draft.')
 if(args.widgetFeedback){
  const feedback=widgetFeedbackSchema.parse(args.widgetFeedback)
  if(!stage.payload.widgetFeedback?.some(f=>f.id===feedback.id)){
   const change=feedback.kind==='fillFreeTime'?{events:stage.payload.calendar.events,result:verifyFreeTimeRequest(stage.payload.calendar.events,stage.payload.calendar.tags,feedback)}:resizeWidgetOccurrence(stage.payload.calendar.events,feedback,stage.payload.calendar.tags)
   stage.payload.calendar.events=change.events
   const completedTask=feedback.done?stage.payload.calendar.events.find(e=>e.id===change.result.eventId)?.planning?.taskId:undefined
   if(completedTask&&completedTask===feedback.task.planningTaskId){
    stage.payload.calendar.events=stage.payload.calendar.events.filter(e=>!(e.planning?.taskId===completedTask&&e.recurrence.frequency==='none'&&Date.parse(e.start)>=feedback.reportedAt*1000))
   }
   stage.payload.widgetFeedback=[...(stage.payload.widgetFeedback||[]),feedback].slice(-200)
   stage.payload.calendar.resolvedWidgetFeedbackIds=[...new Set([...(stage.payload.calendar.resolvedWidgetFeedbackIds||[]),feedback.id])].slice(-200)
   stage.payload.issues.push({id:'widget-feedback:'+feedback.id,message:'Review the complete schedule for this widget request, including its requested duration/completion, downstream work, travel, recovery and recurrence/folder membership. '+change.result.note})
  }
 }
 if(args.removeIds?.length){
  stage.payload.calendar=removeCalendarItems(stage.payload.calendar,args.removeIds,'events',args.removalScope||'event',args.occurrenceStart)
 }
 for(const input of args.events||[]){
  const patch=draftPatch.parse(input),old=patch.id?stage.payload.calendar.events.find(e=>e.id===patch.id):undefined
  if(patch.id&&!old)throw new ApiError(404,'Draft event not found. Omit id to add an event.')
  const event={description:'',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null},...old,...patch,id:old?.id||randomUUID()} as CalendarEvent
  if(!event.title||!event.start||!event.end||Date.parse(event.end)<Date.parse(event.start)||event.tagIds.some(id=>!stage.payload.calendar.tags.some(t=>t.id===id)))throw new ApiError(400,'Draft events need a title, valid start/end, and existing tag IDs.')
  if(event.recurrence.until&&(!Number.isFinite(Date.parse(event.recurrence.until))||event.recurrence.until<event.start.slice(0,10)))throw new ApiError(400,'Recurrence end must be valid and on/after its start.')
  if(event.reminder&&!event.allDay)event.end=new Date(Date.parse(event.start)+1).toISOString()
  if(old)Object.assign(old,event);else stage.payload.calendar.events.push(event)
 }
 stage.payload.calendar.events=normalizeEventFolders(stage.payload.calendar.events);validateEventFolders(stage.payload.calendar.events)
 // Retain original issues as a review checklist even after correcting their fields.
 for(const issue of [...stageIssues(stage.payload.calendar,stage.payload.google),...sourceCalendarIssues(stage.payload.calendar,stage.payload.google.sources||[])])if(!stage.payload.issues.some(i=>i.id===issue.id))stage.payload.issues.push(issue)
 for(const resolution of args.resolutions||[]){
  if(!stage.payload.issues.some(i=>i.id===resolution.issueId)||resolution.decision.trim().length<10)throw new ApiError(400,'Provide a specific resolution for an existing issue.')
  if(resolution.googleAction){
   if(!resolution.issueId.startsWith('missing:'))throw new ApiError(400,'Google cancellation actions apply only to missing linked Google events.')
   const decisions=stage.payload.googleDecisions||={}
   decisions[resolution.issueId.slice('missing:'.length)]=resolution.googleAction
  }
  stage.payload.resolutions[resolution.issueId]=resolution.decision.trim()
 }
 const saved=storage(await db().from('planner_calendar_staging').update({payload:stage.payload,version:stage.version+1,updated_at:new Date().toISOString()}).eq('username',username).eq('id',stage.id).eq('version',stage.version).eq('status','draft').select('id'))
 if(!saved.length)throw new ApiError(409,'The draft changed. Read it again.')
 return stageSummary({...stage,version:stage.version+1})
}
export async function publishCalendarStage(username:string,args:{id:string;version:number;reviewSummary:string}){
 const stage=await stagingRow(username)
 if(!stage||stage.id!==args.id||stage.version!==args.version||stage.status!=='draft')throw new ApiError(409,'Read the latest staging draft before publishing.')
 if(args.reviewSummary.trim().length<20)throw new ApiError(400,'Explain what you reviewed and reconciled.')
 if(stage.payload.issues.some(i=>!stage.payload.resolutions[i.id]))throw new ApiError(409,'Resolve every staging issue before publishing.')
 for(const issue of stageIssues(stage.payload.calendar,stage.payload.google).filter(i=>i.id.startsWith('missing:')))if(!stage.payload.googleDecisions?.[issue.id.slice('missing:'.length)])throw new ApiError(409,'Choose resolutions.googleAction restore or preserve_cancelled for '+issue.id+' before publishing.')
 const current=await calendarRow(username)
 if(current.revision!==stage.base_revision)throw new ApiError(409,'Calendar changed. Prepare a fresh draft before publishing.')
 const problems=widgetDraftProblems(current.state,stage.payload.calendar,stage.payload.widgetFeedback||[])
 if(problems.length)throw new ApiError(409,'The revised plan is not ready. Fix draft conflicts before publishing: '+problems.join('; '))
 const fresh=await googleSnapshot(username,stage.payload.google)
 if(fresh.accountId!==stage.account_id||reviewSnapshotKey(fresh.google)!==reviewSnapshotKey(stage.payload.google)){
  storage(await db().from('planner_calendar_staging').update({status:'stale'}).eq('username',username).eq('id',stage.id).eq('version',stage.version))
  throw new ApiError(409,'Google Calendar changed during review. Prepare a fresh draft; nothing was published.')
 }
 const result=await db().rpc('planner_publish_calendar_stage',{p_username:username,p_id:stage.id,p_version:stage.version,p_summary:args.reviewSummary.trim()})
 if(result.error)throw new ApiError(409,'Could not publish: '+(result.error.message||'calendar/draft changed. Read both again.'))
 return {publishedToPlanner:true,revision:result.data,googleStatus:'Reviewed fixed-event batch queued; check status for completion. Google writes are not a cross-provider atomic transaction.'}
}
export function assertStageEvent(stage:Stage,remoteId:string,before:Remote|null){
 const expected=stage.payload.google.events.find(e=>e.id===remoteId)
 if((expected?.etag||null)!==(before?.etag||null))throw new ApiError(409,'Google event changed since review. Stop and prepare a fresh staging snapshot.')
}
export async function preparePendingStage(onlyUsername?:string){
 const query=db().from('planner_google_fixed_sync').select('username,requested_revision,completed_revision,reviewed_revision').lte('retry_at',new Date().toISOString()).order('retry_at').limit(20)
 const rows=storage(await (onlyUsername?query.eq('username',onlyUsername):query))
 const pending=rows.find(r=>r.requested_revision>r.completed_revision&&r.requested_revision!==r.reviewed_revision)
 if(pending)try{await prepareCalendarStage(pending.username);storage(await db().from('planner_google_fixed_sync').update({retry_at:new Date(Date.now()+300000).toISOString(),error:null}).eq('username',pending.username))}catch(error){storage(await db().from('planner_google_fixed_sync').update({retry_at:new Date(Date.now()+300000).toISOString(),error:error instanceof Error?error.message:'Calendar review snapshot is pending.'}).eq('username',pending.username))}
}
export async function calendarDownload(username:string,staging=false){
 if(staging){const stage=await stagingRow(username);if(!stage)throw new ApiError(404,'No staging snapshot yet. Connect Google Calendar and let the agent prepare one.');return {format:'ai-planner-calendar-stage',formatVersion:1,exportedAt:new Date().toISOString(),...stage}}
 const row=await calendarRow(username);return {format:'ai-planner-calendar',formatVersion:1,timeZone:'America/New_York',exportedAt:new Date().toISOString(),revision:row.revision,calendar:row.state}
}
