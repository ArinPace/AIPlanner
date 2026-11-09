import test from 'node:test'
import assert from 'node:assert/strict'
import {GENERAL_PLANNER_RULES} from '../worker/general-planner-rules.mjs'
import {subscriptionTools} from './subscription-tools.js'
import {toolResultsMessage,relayCalls,relayVisible} from '../src/lib/subscriptionTools.js'

test('subscription tools require active owned turns, use real MCP schemas and replay writes once',async()=>{
 const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://subscription-tools.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';delete process.env.SUPABASE_SECRET_KEY
 const chatId='11111111-1111-4111-8111-111111111111',turnId='22222222-2222-4222-8222-222222222222'
 let turn:any=null,writes=0,revision=1,state:any={events:[],tags:[],hiddenTagIds:[]};const receipts=new Map<string,any>()
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  assert(!['planner_chat_web_relay','planner_device_tool_calls','planner_vm_jobs','planner_vm_hosts'].includes(table||''))
  if(req.method!=='POST')assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_subscription_chats')return Response.json(url.searchParams.get('id')==='eq.'+chatId?{id:chatId,archived:false,deleted_at:null}:null)
  if(table==='planner_subscription_tool_turns'){
   if(req.method==='POST'){const body=await req.json() as any;assert.equal(body.username,'owner');turn={...body,status:'running',expires_at:new Date(Date.now()+3600000).toISOString()};return new Response(null,{status:201})}
   if(req.method==='PATCH'){if(!url.searchParams.has('expires_at')&&turn)turn.status=(await req.json() as any).status;return new Response(null,{status:204})}
   return Response.json(turn&&url.searchParams.get('id')==='eq.'+turnId?turn:null)
  }
  if(table==='planner_agent_instructions')return Response.json({content:'Personal owner instruction',revision:3})
  if(table==='planner_vm_settings')return Response.json({schedule:{times:['07:00'],timezone:'America/New_York',instructions:'Only run when scheduled'},sources:[]})
  if(table==='planner_subscription_tool_calls'){
   const id=url.searchParams.get('call_id')?.slice(3)
   if(req.method==='GET')return Response.json(receipts.get(id!)||null)
   const body=await req.json() as any
   if(req.method==='POST'){assert.equal(body.username,'owner');assert.equal(body.turn_id,turnId);receipts.set(body.call_id,{...body,result:null});return new Response(null,{status:201})}
   receipts.get(id!).result=body.result;return new Response(null,{status:204})
  }
  if(table==='planner_calendar_staging')return Response.json(null)
  if(table==='planner_planning')return Response.json({started_at:'2026-11-05T00:00:00Z'})
  if(table==='planner_calendars'){
   if(req.method==='GET')return Response.json({state,revision})
   const data=await req.json() as any;writes++;state=data.state;revision=data.revision;return Response.json([{revision}])
  }
  throw Error('Unexpected table '+table)
 }
 const run=(action:string,extra:Record<string,unknown>={})=>subscriptionTools('owner',{action,chatId,turnId,...extra})
 try{
  await assert.rejects(()=>run('tool_call',{calls:[{id:'x',name:'planner_save_tag',arguments:{}}]}),/no longer active/)
  await assert.rejects(()=>run('tool_begin',{chatId:'33333333-3333-4333-8333-333333333333',prompt:'Hello'}),/owned/)
  const setup:any=await run('tool_begin',{prompt:'Create a tag'})
  assert(setup.instructions.includes(GENERAL_PLANNER_RULES),'native Chat receives the complete shared general policy');
  assert.match(setup.instructions,/Personal owner instruction/);assert.match(setup.instructions,/CONTEXT ONLY/)
  const catalog:any=await run('tool_call',{calls:[{id:'list',name:'relay_list_tools',arguments:{}}]})
  assert(catalog.results[0].result.some((t:any)=>t.name==='planner_app_settings_update'))
  assert(catalog.results[0].result.some((t:any)=>t.name==='planner_save_note'))
  assert(catalog.results[0].result.some((t:any)=>t.name==='planner_client_control'))
  const client:any=await run('tool_call',{calls:[{id:'client-nav',name:'planner_client_control',arguments:{command:{action:'ui_navigate',tab:'work'}}}]});assert.equal(client.results[0].result.structuredContent.result.executed,false);assert.equal(client.results[0].result.structuredContent.result.clientAction.command.tab,'work');assert.equal(writes,0)
  const badClient:any=await run('tool_call',{calls:[{id:'client-js',name:'planner_client_control',arguments:{command:{action:'ui_navigate',tab:'work',javascript:'alert(1)'}}}]});assert.equal(badClient.results[0].result.isError,true);assert.equal(writes,0)
  assert(!catalog.results[0].result.some((t:any)=>t.name==='browser_open'))
  const ghost:any=await run('tool_call',{calls:[{id:'ghost-native-task',name:'planner_client_control',arguments:{command:{action:'screen_time_task_save',expected:'0'.repeat(64),task:{sourceEventId:'not-a-calendar-event',title:'Ghost rule',start:'2037-01-05T15:00:00Z',end:'2037-01-05T15:16:00Z'}}}}]});assert.equal(ghost.results[0].result.isError,true);assert.equal(writes,0)
  const oversized:any=await run('tool_call',{calls:[{id:'describe-too-many',name:'relay_describe_tools',arguments:{names:Array(12).fill('planner_calendar_read')}}]});assert.match(oversized.results[0].error,/one to eight/);assert.equal(writes,0)
  const calls=[{id:'save-tag',name:'planner_save_tag',arguments:{revision:1,name:'Tools test',color:'#abcdef'}}]
  const first:any=await run('tool_call',{calls});assert.equal(first.results[0].result.isError,undefined);assert.equal(writes,1)
  await run('tool_call',{calls});assert.equal(writes,1)
  await assert.rejects(()=>run('tool_call',{calls:[{...calls[0],arguments:{revision:2,name:'Changed',color:'#abcdef'}}]}),/different request/)
  const invalid:any=await run('tool_call',{calls:[{id:'invalid',name:'planner_save_event',arguments:{}}]});assert.equal(invalid.results[0].result.isError,true);assert.equal(writes,1)
  await run('tool_finish',{cancelled:true});await assert.rejects(()=>run('tool_call',{calls}),/no longer active/)
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
test('tool protocol hides commands, checks current turn and bounds large results without repeating writes',()=>{
 const block='```planner-tools\n'+JSON.stringify({turn:'current',calls:[{id:'one',name:'planner_calendar_read',arguments:{limit:10}}]})+'\n```'
 const plain='PLANNER_TOOL_REQUEST\n'+JSON.stringify({turn:'current',calls:[{id:'one',name:'planner_calendar_read',arguments:{limit:10}}]})+'\nEND_PLANNER_TOOL_REQUEST'
 assert.equal(relayCalls(plain,'current')?.length,1);assert.equal(relayVisible('Working\n'+plain),'Working');assert.throws(()=>relayCalls(plain,'wrong'),/current response/)
 assert.equal(relayCalls(plain.replace('PLANNER_TOOL_REQUEST\n','PLANNER_TOOL_REQUEST\nJSON\n'),'current')?.length,1)
 assert.equal(relayCalls(block,'current')?.length,1);assert.throws(()=>relayCalls(block,'old'),/current response/)
 const output=toolResultsMessage([{id:'read',result:'x'.repeat(80000)}],'current')
 assert(output.length<30000);assert.match(output,/truncated/);assert.match(output,/Never repeat a write/)
})
