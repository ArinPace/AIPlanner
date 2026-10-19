import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarHistory,restoreCalendarEvent} from './calendar-history.js'
test('calendar versions and selective restore are owner-scoped, revision checked and preserve unrelated events',async()=>{
 const originalFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const removed={id:'restore-me',title:'Study',tagIds:[],start:'2026-10-21T10:00:00Z',end:'2026-10-21T11:00:00Z'},unrelated={id:'keep-me',title:'Class'}
 let state:any={events:[unrelated],tags:[],hiddenTagIds:[]},revision=3
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  assert.equal(url.searchParams.get('username'),'eq.arin')
  if(url.pathname.endsWith('planner_calendar_history')){
   if(url.searchParams.get('id'))return Response.json(url.searchParams.get('id')==='eq.2'?{id:2,event_id:removed.id,calendar_key:'internal',before:removed,after:null}:null)
   return Response.json(Array.from({length:51},(_,i)=>({id:100-i,title:'Study'})))
  }
  if(url.pathname.endsWith('planner_calendars')){
   if(request.method==='GET')return Response.json({state,revision})
   assert.equal(url.searchParams.get('revision'),'eq.'+revision);const body=await request.json() as any;state=body.state;revision=body.revision;return Response.json([{revision}])
  }
  throw Error('Unexpected request')
 }
 try{
  const page=await calendarHistory('arin',{});assert.equal(page.versions?.length,50);assert.equal(page.hasMore,true);assert.equal(page.nextBefore,51)
  await assert.rejects(()=>calendarHistory('arin',{versionId:999}),/not found/)
  await assert.rejects(()=>restoreCalendarEvent('arin',{versionId:2,revision:2,side:'before'}),/latest calendar/)
  await restoreCalendarEvent('arin',{versionId:2,revision:3,side:'before'})
  assert.deepEqual(state.events,[unrelated,removed]);assert.equal(revision,4)
  await assert.rejects(()=>restoreCalendarEvent('arin',{versionId:2,revision:4,side:'before'}),/still exists/)
  await assert.rejects(()=>restoreCalendarEvent('arin',{versionId:2,revision:4,side:'after'}),/no event/)
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
