import test from 'node:test'
import assert from 'node:assert/strict'
import {registerPlannerControls} from './planner-control.js'
import {saveEvent} from './planner-workspace.js'
import {planDays} from './planning.js'
import {DEFAULT_PLANNING} from '../src/lib/planning.js'
import {PlannerDate as Date} from '../src/lib/timezone.js'
import {toDateInput} from '../src/lib/dates.js'
test('agent removal protects commitments and optional buffers cannot disguise an existing commitment',async()=>{
 const originalFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const event={id:'call',title:'Phone call',description:'',start:'2026-10-20T14:00:00Z',end:'2026-10-20T14:15:00Z',tagIds:[],allDay:false,recurrence:{frequency:'none',interval:1,until:null}}
 let state:any={events:[event],tags:[{id:'rest',name:'Breaks',color:'#123456'}],hiddenTagIds:[]},revision=1
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);assert.equal(url.searchParams.get('username'),'eq.arin');assert.ok(url.pathname.endsWith('planner_calendars'))
  if(request.method==='GET')return Response.json({state,revision})
  assert.equal(url.searchParams.get('revision'),'eq.'+revision);const body=await request.json() as any;state=body.state;revision=body.revision;return Response.json([{revision}])
 }
 try{
  const tools:Record<string,(args:any)=>Promise<any>>={}
  registerPlannerControls((name,_description,_schema,_scope,_readOnly,execute)=>{tools[name]=execute},'arin')
  await assert.rejects(()=>tools.planner_delete_events({ids:['call'],revision,scope:'event'}),/Explicit user removal permission/)
  await assert.rejects(()=>saveEvent('arin',{id:'call',revision,activityType:'buffer'}),/Do not reclassify/)
  const buffer=await saveEvent('arin',{revision,title:'Listen to music if the call finishes early',start:'2026-10-20T14:15:00Z',end:'2026-10-20T14:30:00Z',activityType:'buffer',bufferForEventId:'call',tagIds:['rest']})
  assert.equal(buffer.event.planning?.kind,'buffer');assert.equal(buffer.event.planning?.bufferForEventId,'call');revision=buffer.revision
  await tools.planner_delete_events({ids:[buffer.eventId],revision,scope:'event'});assert.equal(state.events.length,1)
  await tools.planner_delete_events({ids:['call'],revision,scope:'event',userConfirmed:true});assert.equal(state.events.length,0)
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})

test('a rebuild cannot erase the last future allocation for unfinished work',async()=>{
 const originalFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const date=toDateInput(new Date(Date.now()+86400000))
 const task={id:'task',title:'Finish assignment',source:'todo:source',minutes:60,urgency:70,category:'study',status:'todo',deadline:null,preferredDays:[],earliestDate:null,goal:''}
 const profile={...structuredClone(DEFAULT_PLANNING),enabled:true,wake:'07:00',sleep:'23:00',intensity:0,tasks:[task]}
 let commits=0
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  if(url.pathname.includes('/rpc/')){commits++;return Response.json({revision:2})}
  if(request.method==='GET')assert.equal(url.searchParams.get('username'),'eq.arin')
  if(url.pathname.endsWith('planner_planning'))return request.method==='GET'?Response.json({state:profile,revision:1,started_at:'2026-01-01T00:00:00Z'}):new Response(null,{status:201})
  if(url.pathname.endsWith('planner_files'))return Response.json({state:{files:[]}})
  if(url.pathname.endsWith('planner_calendars'))return Response.json({state:{events:[{id:'old-allocation',title:task.title,start:new Date(date+'T10:00:00').toISOString(),end:new Date(date+'T11:00:00').toISOString(),allDay:false,description:'',tagIds:[],recurrence:{frequency:'none',interval:1,until:null},planning:{kind:'task',taskId:task.id,locked:false}}],tags:[],hiddenTagIds:[]},revision:1})
  throw Error('Unexpected request')
 }
 try{
  const preview=await planDays('arin',{date,days:1,revision:1,preview:true})
  assert.ok(preview.warnings.some(warning=>warning.includes('last future allocation')))
  await assert.rejects(()=>planDays('arin',{date,days:1,revision:1}),/last future allocation/)
  assert.equal(commits,0,'The original calendar must remain intact')
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
