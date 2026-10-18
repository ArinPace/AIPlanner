import test from 'node:test'
import assert from 'node:assert/strict'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {createPlannerMcp} from './mcp.js'
import {removeCalendarItems} from './planner-control.js'
import {patchWorkspaceItems} from './planner-items.js'
import {searchFiles} from './planner-workspace.js'
import type {StoredState} from '../src/types.js'
import type {FilesState} from '../src/lib/files.js'

test('calendar removal preserves unrelated data and requires whole-series scope for recurrence',()=>{
 const state:StoredState={events:[{id:'event',title:'Keep description',description:'writing',start:'2026-10-18T09:00:00Z',end:'2026-10-18T10:00:00Z',allDay:false,tagIds:['tag','keep'],recurrence:{frequency:'weekly',interval:1,until:null}}],tags:[{id:'tag',name:'Remove',color:'#123456'},{id:'keep',name:'Keep',color:'#654321'}],hiddenTagIds:['tag'],zoom:1.2}
 const original=structuredClone(state)
 assert.throws(()=>removeCalendarItems(state,['event'],'events','event'),/whole-series/)
 assert.throws(()=>removeCalendarItems(state,['missing'],'tags'),/no longer exists/)
 const next=removeCalendarItems(state,['tag'],'tags')
 assert.deepEqual(next.events[0],{...state.events[0],tagIds:['keep']})
 assert.deepEqual(next.tags,[state.tags[1]]);assert.deepEqual(next.hiddenTagIds,[]);assert.equal(next.zoom,1.2)
 assert.equal(removeCalendarItems(state,['event'],'events','series').events.length,0)
 assert.deepEqual(state,original)
})
test('bulk Files edits preserve content/identity, reject invalid batches atomically and search note tags',()=>{
 const state:FilesState={folders:[{id:'a',parentId:null,name:'Subject',labels:[],color:'#123456',updatedAt:'2026-10-18T00:00:00Z'}],files:[{id:'n',folderId:null,name:'Note',content:'Manual writing',format:'note',tags:['exam'],richText:'{"type":"doc"}',richTextSource:'Manual writing',updatedAt:'2026-10-18T00:00:00Z'}],documents:[{id:'82400000-0000-4000-8000-000000000000',folderId:null,name:'Reading.pdf',kind:'pdf',size:100,updatedAt:'2026-10-18T00:00:00Z'}]}
 const original=structuredClone(state)
 const next=patchWorkspaceItems(state,[{id:'n',folderId:'a',name:'Study plan'},{id:'82400000-0000-4000-8000-000000000000',folderId:'a'}])
 assert.equal(next.state.files[0].content,'Manual writing');assert.equal(next.state.files[0].richText,state.files[0].richText)
 assert.equal(next.state.documents![0].id,'82400000-0000-4000-8000-000000000000');assert.equal(next.state.documents![0].folderId,'a')
 for(const items of [[{id:'n',name:'Changed'},{id:'missing',name:'No'}],[{id:'a',parentId:'a'}],[{id:'82400000-0000-4000-8000-000000000000',content:'Replace PDF'}],[{id:'n',name:'A'},{id:'n',name:'B'}]])assert.throws(()=>patchWorkspaceItems(state,items))
 assert.deepEqual(state,original)
 assert.equal(searchFiles(state,{query:'exam'}).items[0].id,'n')
})
test('capability guide matches registered tools and new mutations honor read-only scope',async()=>{
 const server=createPlannerMcp('arin',['planner:read']),client=new Client({name:'capabilities-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair()
 await server.connect(st);await client.connect(ct)
 try{
  const names=new Set((await client.listTools()).tools.map(t=>t.name))
  const guide=await client.callTool({name:'planner_capabilities',arguments:{}})
  assert.ok(!guide.isError)
  const raw=JSON.stringify(guide.structuredContent)
  for(const name of raw.match(/planner_[a-z_]+/g)||[])assert.ok(names.has(name),name+' missing from catalog')
  for(const [name,args] of [['planner_delete_events',{ids:['event'],revision:0,scope:'event'}],['planner_delete_tags',{ids:['tag'],revision:0}],['planner_bulk_update_items',{items:[{id:'n',name:'Changed'}],revision:0}],['planner_manage_chats',{action:'create',title:'Test'}]] as const){
   const result=await client.callTool({name,arguments:args});assert.equal(result.isError,true);assert.match(JSON.stringify(result.content),/planner:write/)
  }
 }finally{await client.close();await server.close()}
})

test('calendar deletion tools are owner-scoped and reject stale revisions',async()=>{
 const before=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY,oldSecret=process.env.SUPABASE_SECRET_KEY
 process.env.SUPABASE_URL='https://capability-control.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';delete process.env.SUPABASE_SECRET_KEY
 let row={revision:7,state:{events:[{id:'e',title:'Temporary',description:'Keep',start:'2026-10-18T09:00:00Z',end:'2026-10-18T10:00:00Z',allDay:false,tagIds:['t'],recurrence:{frequency:'none',interval:1,until:null}}],tags:[{id:'t',name:'Temp',color:'#123456'}],hiddenTagIds:['t']}}
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  assert.equal(url.hostname,'capability-control.test');assert.equal(url.searchParams.get('username'),'eq.arin')
  assert.ok(url.pathname.endsWith('/planner_calendars'))
  if(request.method==='PATCH'){
   assert.equal(url.searchParams.get('revision'),'eq.'+row.revision)
   const saved=await request.json() as typeof row;row={state:saved.state,revision:saved.revision};return Response.json([{revision:row.revision}])
  }
  return Response.json(row)
 }
 const server=createPlannerMcp('arin',['planner:read','planner:write']),client=new Client({name:'delete-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair()
 await server.connect(st);await client.connect(ct)
 try{
  const stale=await client.callTool({name:'planner_delete_events',arguments:{ids:['e'],revision:6,scope:'event'}});assert.ok(stale.isError);assert.equal(row.state.events.length,1)
  assert.ok(!(await client.callTool({name:'planner_delete_tags',arguments:{ids:['t'],revision:7}})).isError)
  assert.deepEqual(row.state.events[0].tagIds,[]);assert.equal(row.state.events[0].description,'Keep')
  assert.ok(!(await client.callTool({name:'planner_delete_events',arguments:{ids:['e'],revision:8,scope:'event'}})).isError)
  assert.equal(row.state.events.length,0);assert.equal(row.revision,9)
 }finally{
  await client.close();await server.close();globalThis.fetch=before
  for(const [key,value] of Object.entries({SUPABASE_URL:oldUrl,SUPABASE_SERVICE_ROLE_KEY:oldKey,SUPABASE_SECRET_KEY:oldSecret})){if(value===undefined)delete process.env[key];else process.env[key]=value}
 }
})
