import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createPlannerMcp, handleMcpRequest } from './mcp.js'
import { validRedirect } from './mcp-auth.js'
import { browserUrl } from './mcp-browser.js'
import { chatUrl } from './chat-links.js'

test('OAuth callbacks and saved chat links reject credential leaks and lookalike domains',()=>{
  assert.equal(validRedirect('https://chatgpt.com/connector_platform/oauth/callback'),true)
  assert.equal(validRedirect('http://127.0.0.1:4317/callback'),true)
  for (const url of ['https://chatgpt.com.evil.example/callback','https://user:pass@chatgpt.com/callback','https://evil.example/callback','http://localhost:4317/callback']) assert.equal(validRedirect(url),false)
  assert.equal(chatUrl('https://chatgpt.com/c/6ab5101f-2f6c-83ea-9164-7380356691a5?tracking=1'),'https://chatgpt.com/c/6ab5101f-2f6c-83ea-9164-7380356691a5')
  assert.throws(()=>chatUrl('https://chatgpt.com/share/6ab5101f-2f6c-83ea-9164-7380356691a5'))
  assert.throws(()=>chatUrl('https://chatgpt.com.evil.example/c/6ab5101f-2f6c-83ea-9164-7380356691a5'))
})
test('cloud browser accepts only enabled sources and blocks internal/credential/destructive destinations',()=>{
  assert.equal(browserUrl('https://brightspace.nyu.edu/d2l/home/629777',['brightspace']),'https://brightspace.nyu.edu/d2l/home/629777')
  for (const url of ['http://127.0.0.1:9222','https://mail.google.com/mail/u/0','https://brightspace.nyu.edu.evil.example','https://brightspace.nyu.edu/logout','https://user:password@brightspace.nyu.edu']) assert.throws(()=>browserUrl(url,['brightspace']))
})
test('MCP exposes discovery and checks write/browser scopes before any storage or browser operation',async()=>{
  const server = createPlannerMcp('arin',['planner:read'])
  const client = new Client({name:'planner-test',version:'1.0'})
  const [clientTransport,serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport);await client.connect(clientTransport)
  try {
    const tools = await client.listTools()
    assert.ok(tools.tools.find(t=>t.name==='planner_read'))
    assert.ok(tools.tools.find(t=>t.name==='browser_read'))
    for(const name of ['planner_calendar_read','planner_files_search','planner_read_file','planner_update_item','planner_memory_read','planner_memory_write'])assert.ok(tools.tools.some(t=>t.name===name))
    for(const [name,args] of [
      ['planner_memory_write',{revision:0,content:'No access'}],
      ['planner_file_upload_start',{name:'test.docx',mime:'application/octet-stream',size:123}],
      ['planner_file_upload_finish',{id:'a1111111-1111-4111-8111-111111111111',folderId:null,revision:0}],
      ['planner_complete_event',{eventId:'event',occurrenceStart:'2037-01-01T12:00:00Z',revision:0}],
      ['planner_notification_inbox_check',{id:'issue',checked:true}],
      ['planner_chat_schedule_update',{expectedUpdatedAt:null,enabled:false}],
      ['planner_save_event',{id:'event',revision:0,title:'Changed'}],
      ['planner_update_item',{id:'file',revision:0,name:'Changed'}],
      ['planner_save_note',{folderId:null,name:'No access',content:'text',revision:0}],
      ['planner_save_text_file',{folderId:null,name:'No access',content:'text',revision:0}],
      ['planner_trash_items',{ids:['file'],revision:0}],
      ['planner_restore_items',{ids:['entry'],revision:0}],
      ['planner_save_tag',{name:'School',color:'#123456',revision:0}],
    ] as const){
      const denied=await client.callTool({name,arguments:args})
      assert.equal(denied.isError,true);assert.match(JSON.stringify(denied.content),/planner:write/)
    }
    const overview=await client.callTool({name:'planner_capabilities',arguments:{section:'overview'}})
    assert.ok(JSON.stringify(overview).length<6000)
    const filesGuide=await client.callTool({name:'planner_capabilities',arguments:{section:'files'}})
    assert.match(JSON.stringify(filesGuide),/planner_file_upload_finish/)
    assert.ok(tools.tools.find(t=>t.name==='planner_file_download')?.annotations?.readOnlyHint)
    assert.equal(tools.tools.find(t=>t.name==='planner_delete_events')?.annotations?.destructiveHint,true)
    const result = await client.callTool({name:'planner_register_chat',arguments:{title:'Daily updates',url:'https://chatgpt.com/c/6ab5101f-2f6c-83ea-9164-7380356691a5'}})
    assert.equal(result.isError,true)
    assert.match(JSON.stringify(result.content),/planner:write/)
    const schedule=await client.callTool({name:'planner_schedule_update',arguments:{expectedUpdatedAt:'2026-10-16T00:00:00Z',enabled:false}})
    assert.equal(schedule.isError,true)
    assert.match(JSON.stringify(schedule.content),/planner:write/)
    const browser = await client.callTool({name:'browser_open',arguments:{}})
    assert.equal(browser.isError,true)
    assert.match(JSON.stringify(browser.content),/browser:read/)
  } finally {await client.close();await server.close()}
})

test('stateless HTTP discovery survives transport closure and a fresh request',async()=>{
  for (const message of [{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}},{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}]) {
    const server=createPlannerMcp('arin',['planner:read'])
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
    await server.connect(transport)
    const response=await transport.handleRequest(new Request('https://planner.test/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(message)}))
    await server.close()
    assert.equal(response.status,200)
    const data=await response.json() as {result?:{tools:{name:string}[]}}
    assert.ok(data.result)
    if(message.method==='tools/list')for(const name of ['planner_read','planner_schedule_read','planner_schedule_update','google_calendar_accounts','google_calendar_read'])assert.ok(data.result.tools.some(t=>t.name===name))
  }
})

test('anonymous discovery exposes tool schemas but account data and actions require OAuth',async()=>{
  const response=await handleMcpRequest(new Request('https://aiplanner-ten.vercel.app/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}),'/api/mcp')
  assert.equal(response.status,200)
  const data=await response.json() as {result:{tools:{name:string}[]}}
  assert.ok(data.result.tools.some(t=>t.name==='planner_read'))
  const action=await handleMcpRequest(new Request('https://aiplanner-ten.vercel.app/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'planner_read',arguments:{}}})}),'/api/mcp')
  assert.equal(action.status,401)
  assert.match(action.headers.get('WWW-Authenticate') || '',/oauth-protected-resource/)
})

test('WHOOP browser reads require enabled exact WHOOP origin',()=>{
 assert.equal(browserUrl('https://app.whoop.com/', ['whoop']), 'https://app.whoop.com/')
 assert.throws(()=>browserUrl('https://app.whoop.com/', ['brightspace']))
 assert.throws(()=>browserUrl('https://app.whoop.com.evil.test/', ['whoop']))
 assert.throws(()=>browserUrl('https://app.whoop.com/logout', ['whoop']))
})

test('paginated note reads do not return an unpaginated agent snapshot',async()=>{
 const savedFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://note-read.test';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';delete process.env.SUPABASE_SECRET_KEY
 const server=createPlannerMcp('arin',['planner:read']),client=new Client({name:'note-test',version:'1'})
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a)
 let reads=0
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init);assert(new URL(request.url).pathname.endsWith('/rpc/planner_read_file_item'));assert.deepEqual(await request.json(),{p_username:'arin',p_id:'large-note'});reads++
  return Response.json({revision:42,section:'files',item:{id:'large-note',name:'Agent To Do',format:'note',content:'x'.repeat(100000),agentSnapshot:'unpaginated private snapshot'.repeat(10000)}})
 }
 try{
  const result=await client.callTool({name:'planner_read_file',arguments:{id:'large-note',limit:1000}})
  assert(!result.isError);const serialized=JSON.stringify(result);assert(serialized.length<5000);assert(!serialized.includes('agentSnapshot'));assert(!serialized.includes('unpaginated private snapshot'));assert.equal(reads,1)
 }finally{await client.close();await server.close();globalThis.fetch=savedFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})

test('agent discovery reads file metadata without fetching the Notes corpus',async()=>{
 const savedFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://metadata-read.test';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';delete process.env.SUPABASE_SECRET_KEY
 const server=createPlannerMcp('arin',['planner:read']),client=new Client({name:'metadata-test',version:'1'})
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a)
 let metadataReads=0
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1)
  assert.notEqual(table,'planner_files','Discovery must not fetch full note bodies')
  if(table==='planner_files_metadata'){
   assert.deepEqual(await request.json(),{p_username:'arin'});metadataReads++
   return Response.json({revision:42,folders:[],files:[{id:'note',folderId:null,name:'Note',format:'note',tags:[],pinned:false,updatedAt:'2026-11-25T12:00:00Z'}],documents:[]})
  }
  if(request.method==='POST')return Response.json(null)
  assert.equal(url.searchParams.get('username'),'eq.arin')
  if(table==='planner_calendars')return Response.json({revision:1,state:{events:[],tags:[]}})
  if(table==='planner_agent_runs')return Response.json([])
  if(table==='planner_agent_settings')return Response.json({sources:[],context_focus:''})
  if(table==='planner_vm_settings')return Response.json({sources:['whoop'],schedule_enabled:true,schedule:{times:['07:00']},updated_at:'2026-11-25T12:00:00Z'})
  throw Error('Unexpected table '+table)
 }
 try{
  const result=await client.callTool({name:'planner_read',arguments:{}})
  assert(!result.isError,JSON.stringify(result));assert.equal(metadataReads,1)
  const value=JSON.parse((result.content as {text:string}[])[0].text)
  assert.equal(value.files.revision,42);assert.equal(value.files.files[0].name,'Note');assert.deepEqual(value.sources,['whoop'])
 }finally{await client.close();await server.close();globalThis.fetch=savedFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
