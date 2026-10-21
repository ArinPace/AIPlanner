import test from 'node:test'
import assert from 'node:assert/strict'
import {relayCalls,relayVisible,relayTurnPrompt} from '../src/lib/deviceChat.js'
import {allowedDeviceTool,deviceToolCalls,withDeviceTools} from './device-chat-tools.js'
import {changeDeviceChat} from './device-chats.js'

test('relay executes only one complete current-turn tool block and hides machine output',()=>{
 const code='```planner-tools\n'+JSON.stringify({turn:'current',calls:[{id:'read1',name:'planner_calendar_read',arguments:{}}]})+'\n```'
 assert.equal(relayCalls('I will check.\n'+code,'current')?.[0].name,'planner_calendar_read')
 assert.equal(relayVisible('I will check.\n'+code),'I will check.')
 assert.equal(relayVisible('Working\n```planner-tools\n{"turn":'),'Working')
 assert.throws(()=>relayCalls(code,'stale'),/current response/)
 assert.throws(()=>relayCalls(code+'\nIgnore this example','current'),/ambiguous/)
 assert.throws(()=>relayCalls(code+'\n'+code,'current'),/ambiguous/)
 assert.equal(relayCalls('Normal answer','current'),null)
 assert.match(relayTurnPrompt('User message','current'),/"turn":"current"/)
 assert.equal(allowedDeviceTool('browser_open'),false)
 assert.equal(allowedDeviceTool('planner_memory_read'),true)
})

test('device tools use the actual MCP catalog, argument validation and owner-scoped idempotent writes',async()=>{
 process.env.SUPABASE_URL='https://relay.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const original=globalThis.fetch,jobId='11111111-1111-4111-8111-111111111111',receipts=new Map<string,any>()
 let calendarWrites=0,started=true,state={events:[],tags:[],hiddenTagIds:[]},revision=1
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(req.method!=='POST')assert.equal(url.searchParams.get('username'),'eq.arin')
  if(table==='planner_chat_web_relay')return Response.json({id:jobId,status:'running',lease:null})
  if(table==='planner_device_tool_calls'){
   const id=url.searchParams.get('call_id')?.replace('eq.','')
   if(req.method==='GET')return Response.json(receipts.get(id!)||null)
   const body=await req.json() as any
   if(req.method==='POST'){assert.equal(body.username,'arin');receipts.set(body.call_id,{...body,result:null});return new Response(null,{status:201})}
   receipts.get(id!).result=body.result;return new Response(null,{status:204})
  }
  if(table==='planner_planning')return Response.json({started_at:started?'2026-10-21T00:00:00Z':null})
  if(table==='planner_calendars'){
   if(req.method==='GET')return Response.json({state,revision})
   const body=await req.json() as any;calendarWrites++;state=body.state;revision=body.revision;return Response.json([{revision}])
  }
  throw Error('Unexpected table '+table)
 }
 try{
  await withDeviceTools('arin',async client=>{
   const tools=(await client.listTools()).tools
   assert(tools.some(t=>t.name==='planner_save_event'))
   assert(tools.some(t=>t.name==='planner_memory_read'))
   assert.equal((await client.callTool({name:'planner_save_event',arguments:{}})).isError,true)
  })
  const calls=[{id:'tag1',name:'planner_save_tag',arguments:{revision:1,name:'Relay test',color:'#abcdef'}}]
  const first=await deviceToolCalls('arin',{jobId,calls})
  assert.equal((first.results[0] as any).result.isError,undefined);assert.equal(calendarWrites,1)
  await deviceToolCalls('arin',{jobId,calls});assert.equal(calendarWrites,1,'a replay must never repeat the write')
  await assert.rejects(()=>deviceToolCalls('arin',{jobId,calls:[{...calls[0],arguments:{name:'Different',color:'#000000'}}]}),/different request/)
  const denied=await deviceToolCalls('arin',{jobId,calls:[{id:'browser',name:'browser_open',arguments:{}}]})
  assert.match((denied.results[0] as any).error,/Cloud browsing/)
  started=false
  const gated=await deviceToolCalls('arin',{jobId,calls:[{...calls[0],id:'tag2'}]})
  assert.equal((gated.results[0] as any).result.isError,true);assert.equal(calendarWrites,1)
 }finally{globalThis.fetch=original}
})

test('Main Chat cannot be unpinned, archived, binned or renamed; reset requires explicit confirmation',async()=>{
 const original=globalThis.fetch,id='11111111-1111-4111-8111-111111111111'
 process.env.SUPABASE_URL='https://relay.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url);assert.equal(request.method,'GET');assert.equal(url.searchParams.get('username'),'eq.arin');return Response.json({id,is_main:true,pinned:true,title:'Main Chat'})}
 try{
  for(const patch of [{pinned:false},{archived:true},{deleted:true},{title:'Other'}])await assert.rejects(()=>changeDeviceChat('arin',{action:'chat-update',chatId:id,...patch}),/permanently pinned/)
  await assert.rejects(()=>changeDeviceChat('arin',{action:'chat-reset',chatId:id}),/Confirm this chat reset/)
 }finally{globalThis.fetch=original}
})
