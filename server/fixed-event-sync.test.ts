import test from 'node:test'
import assert from 'node:assert/strict'
import {eventType} from '../src/lib/eventType.js'
import {fixedEventPayload,fixedGoogleId} from './fixed-event-payload.js'
import {processFixedSync} from './google-fixed-sync.js'
import {sealVmCredential} from './vm-vault.js'
import {GOOGLE_CALENDAR_SCOPE,GOOGLE_CALENDAR_WRITE_SCOPE} from './agent.js'
import type {CalendarEvent} from '../src/types.js'
const event=(id:string,extra:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:id,description:'Room 101',start:'2026-10-26T10:00:00-04:00',end:'2026-10-26T11:00:00-04:00',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null},scheduleType:'fixed',...extra})
test('secondary classification honors explicit user choice; legacy work is planned; Google dates retain New York day/recurrence',()=>{
 assert.equal(eventType(event('class')),'fixed')
 assert.equal(eventType(event('study',{scheduleType:undefined,planning:{kind:'task',locked:true}})),'planned')
 assert.equal(eventType(event('fixed',{planning:{kind:'task',locked:false}})),'fixed')
 assert.equal(eventType(event('legacy',{scheduleType:undefined,tagIds:['todo']}),[{id:'todo',name:'to-do',color:'#fff'}]),'planned')
 const allDay=fixedEventPayload(event('holiday',{allDay:true,start:'2026-10-26T00:00:00-04:00',end:'2026-10-27T23:59:59-04:00'}))
 assert.deepEqual(allDay.start,{date:'2026-10-26'});assert.deepEqual(allDay.end,{date:'2026-10-28'})
 const recurring=fixedEventPayload(event('class',{recurrence:{frequency:'weekly',interval:1,until:'2026-11-15'}}))
 assert.equal(recurring.recurrence[0],'RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261116T045959Z')
 assert.equal(fixedGoogleId('a','id'),fixedGoogleId('a','id'));assert.notEqual(fixedGoogleId('a','id'),fixedGoogleId('b','id'))
})
test('queued Google export excludes planned work, deduplicates originals, retries uncertain writes and preserves unrelated Google data',async()=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','CONNECTION_ENCRYPTION_KEY'] as const,env=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch
 process.env.SUPABASE_URL='https://fixed-sync.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY;process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32)
 const accountId='ee34ba25-54bc-44df-8515-f7e6784dfed1',mappings:any[]=[],audits:any[]=[],remote=new Map<string,any>()
 let events=[event('class'),event('homework',{scheduleType:'planned'}),event('existing')],writes=0,deletes=0,canEdit=true,uncertain=false,lastQueue:any
 remote.set('original',{id:'original',etag:'v1',...fixedEventPayload(event('existing')),attendees:[{email:'friend@example.com'}]})
 const reply=(value:unknown)=>Response.json(value)
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),method=request.method
  if(url.hostname==='fixed-sync.test'){
   if(url.pathname.endsWith('/rpc/planner_claim_fixed_sync')){assert.deepEqual(await request.json(),{p_username:'owner'});return reply([{username:'owner',lease:'lease-1'}])}
   if(url.searchParams.has('username'))assert.equal(url.searchParams.get('username'),'eq.owner')
   if(url.pathname.endsWith('/planner_calendars'))return reply({state:{events,tags:[],hiddenTagIds:[]},revision:10})
   if(url.pathname.endsWith('/planner_vm_settings'))return reply({google_account_id:accountId})
   if(url.pathname.endsWith('/planner_google_accounts')){const a={id:accountId,identity:'owner@example.com',credentials:sealVmCredential({access_token:'private',scope:GOOGLE_CALENDAR_SCOPE+(canEdit?' '+GOOGLE_CALENDAR_WRITE_SCOPE:''),expires_at:Date.now()+3600000})};return reply(url.searchParams.has('id')?a:[a])}
   if(url.pathname.endsWith('/planner_google_fixed_events')){
    if(method==='GET')return reply(mappings)
    if(method==='POST'){const m=await request.json() as any;assert.equal(m.username,'owner');const old=mappings.findIndex(v=>v.local_id===m.local_id);if(old<0)mappings.push(m);else mappings[old]=m;return new Response(null,{status:201})}
    if(method==='DELETE'){mappings.splice(mappings.findIndex(m=>'eq.'+m.local_id===url.searchParams.get('local_id')),1);return new Response(null,{status:204})}
   }
   if(url.pathname.endsWith('/planner_calendar_history')){const body=await request.json() as any;if(method==='POST'){audits.push(body);return reply({id:audits.length})}return new Response(null,{status:204})}
   if(url.pathname.endsWith('/planner_google_fixed_sync')){lastQueue=await request.json();return new Response(null,{status:204})}
  }
  if(url.hostname==='www.googleapis.com'){
   assert.equal(request.headers.get('authorization'),'Bearer private')
   const id=url.pathname.split('/events/')[1]
   if(method==='GET')return id?(remote.has(id)?reply(remote.get(id)):new Response(null,{status:404})):reply({items:[...remote.values()]})
   assert.equal(url.searchParams.get('sendUpdates'),'none');assert(audits.length>0)
   if(method==='DELETE'){deletes++;remote.delete(id!);return new Response(null,{status:204})}
   const payload=await request.json() as any;writes++
   if(method==='PATCH'){assert.equal(request.headers.get('if-match'),remote.get(id!)?.etag);assert.equal(payload.attendees,undefined);remote.set(id!,{...remote.get(id!),...payload,etag:'v2'})}
   else {assert.equal(payload.id,fixedGoogleId('owner','class'));remote.set(payload.id,{...payload,etag:'v1'});if(uncertain){uncertain=false;throw Error('Simulated lost response after Google saved the event')}}
   return reply(remote.get(id||payload.id))
  }
  throw Error('Unexpected URL '+url.origin+url.pathname)
 }
 try{
  uncertain=true
  assert((await processFixedSync('owner')).error);assert.equal(writes,1)
  await processFixedSync('owner');assert.equal(writes,2) // stable ID PATCH verifies uncertain create; original adopted without write
  assert.equal(mappings.length,2);assert.equal(mappings.find(m=>m.local_id==='existing').managed,false);assert.equal(remote.size,2)
  await processFixedSync('owner');assert.equal(writes,2);assert.equal(lastQueue.completed_revision,10)
  events=events.map(e=>e.id==='existing'?{...e,title:'Updated appointment'}:e)
  await processFixedSync('owner');assert.equal(writes,3);assert.deepEqual(remote.get('original').attendees,[{email:'friend@example.com'}])
  events=events.map(e=>({...e,scheduleType:'planned'}))
  await processFixedSync('owner');assert.equal(deletes,1);assert(remote.has('original'));assert.equal(mappings.length,0)
  canEdit=false;const before=writes;assert.match((await processFixedSync('owner')).error!,/approve event editing/);assert.equal(writes,before)
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
