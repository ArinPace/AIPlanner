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
