import test from 'node:test'
import assert from 'node:assert/strict'
import {syncTodoCompletion} from './planning.js'
import {DEFAULT_PLANNING} from '../src/lib/planning.js'
import {todoChecklist} from './todo-completion.js'

test('saved checklist completion persists task state and cleans calendar with owner/revision guards, but never before activation',async()=>{
 const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const,oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://todo-sync.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const files={folders:[],files:[{id:'todo',systemRole:'todo' as const,name:'To do',folderId:null,content:'- [x] Done task',updatedAt:''}]}
 const source=todoChecklist(files)[0].source
 const state=structuredClone(DEFAULT_PLANNING)
 state.tasks=[{id:'task1',title:'Done task',category:'personal',urgency:0,minutes:30,deadline:null,preferredDays:[],earliestDate:null,status:'todo',source,goal:''}]
 let planning={state,revision:1,started_at:null as string|null}
 const future=new Date(Date.now()+86400000).toISOString()
 let calendar={state:{events:[{id:'remove',start:future,end:future,planning:{taskId:'task1',locked:true},recurrence:{frequency:'none'}},{id:'keep-series',start:future,end:future,planning:{taskId:'task1'},recurrence:{frequency:'daily'}}],tags:[],hiddenTagIds:[]},revision:4}
 let calendarWrites=0,conflictOnce=true
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(req.method==='POST'){assert.equal(table,'planner_planning');assert.equal(((await req.json()) as {username:string}).username,'arin');return Response.json(null)}
  assert.equal(url.searchParams.get('username'),'eq.arin')
  if(req.method==='GET')return Response.json(table==='planner_files'?{state:files}:table==='planner_planning'?planning:calendar)
  assert.equal(req.method,'PATCH')
  const row=table==='planner_planning'?planning:calendar
  assert.equal(url.searchParams.get('revision'),'eq.'+row.revision)
  if(table==='planner_calendars'&&conflictOnce){conflictOnce=false;return Response.json([])}
  const patch=await req.json() as any
  if(table==='planner_planning')planning={...planning,...patch};else{calendar={...calendar,...patch};calendarWrites++}
  return Response.json([{revision:patch.revision}])
 }
 try{
  await syncTodoCompletion('arin');assert.equal(planning.state.tasks[0].status,'done');assert.equal(calendarWrites,0)
  planning.started_at=new Date().toISOString();await syncTodoCompletion('arin')
  assert.equal(calendarWrites,1);assert.deepEqual(calendar.state.events.map(e=>e.id),['keep-series'])
  const revision=planning.revision;await syncTodoCompletion('arin');assert.equal(planning.revision,revision);assert.equal(calendarWrites,1)
 }finally{globalThis.fetch=oldFetch;for(const key of keys){if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key]}}
})
