import test from 'node:test'
import assert from 'node:assert/strict'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {createPlannerMcp} from './mcp.js'

test('failed source save releases its collection and the same request can retry exactly once',async()=>{
 const originalFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY
 process.env.SUPABASE_URL='https://source-sync.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 let run:any=null,rpcCalls=0,applied=0
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  assert.equal(url.hostname,'source-sync.test')
  if(url.pathname.endsWith('/planner_agent_settings'))return request.method==='GET'?Response.json({sources:['brightspace']}):new Response(null,{status:204})
  if(url.pathname.endsWith('/planner_vm_settings'))return Response.json([{sources:['brightspace']}])
  if(url.pathname.endsWith('/planner_agent_runs')){
   if(request.method!=='POST')assert.equal(url.searchParams.get('username'),'eq.arin')
   if(request.method==='POST'){const body=await request.json() as Record<string,any>;run={...body,id:'00000000-0000-4000-8000-000000000001',applied_at:null};return Response.json(run)}
   if(request.method==='PATCH'){Object.assign(run,await request.json());return new Response(null,{status:204})}
   return Response.json(request.headers.get('accept')?.includes('object')?run:run?[run]:[])
  }
  if(url.pathname.endsWith('/planner_calendars'))return Response.json({revision:1,state:{events:[],tags:[],hiddenTagIds:[],zoom:1}})
  if(url.pathname.endsWith('/planner_files'))return Response.json({revision:1,state:{folders:[],files:[],documents:[]}})
  assert.ok(url.pathname.endsWith('/rpc/planner_apply_sync'))
  const body=await request.json() as Record<string,any>;assert.equal(body.p_username,'arin');rpcCalls++
  if(rpcCalls===1)return Response.json({code:'XX000',message:'Internal fixture failure'},{status:500})
  applied++;Object.assign(run,{status:'succeeded',applied_at:new Date().toISOString()});return Response.json(true)
 }
 const server=createPlannerMcp('arin',['planner:write']),client=new Client({name:'save-retry-test',version:'1'})
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a)
 const args={requestKey:'source-retry-fixture',summary:'Verified source',updates:[{source:'brightspace',course:'CS',title:'Reading',url:'https://brightspace.nyu.edu/d2l/home/123',summary:'Read chapter one',dueAt:null}]}
 try{
  const failed=await client.callTool({name:'planner_apply_updates',arguments:args});assert.equal(failed.isError,true);assert.equal(run.status,'failed');assert.equal(applied,0)
  const retried=await client.callTool({name:'planner_apply_updates',arguments:args});assert.ok(!retried.isError);assert.equal(run.status,'succeeded');assert.equal(applied,1)
  const duplicate=await client.callTool({name:'planner_apply_updates',arguments:args});assert.ok(!duplicate.isError);assert.equal(applied,1)
 }finally{await client.close();await server.close();globalThis.fetch=originalFetch;for(const [key,value] of Object.entries({SUPABASE_URL:oldUrl,SUPABASE_SECRET_KEY:oldSecret,SUPABASE_SERVICE_ROLE_KEY:oldKey})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
