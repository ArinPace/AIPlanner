import test from 'node:test'
import assert from 'node:assert/strict'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {createPlannerMcp} from './mcp.js'
import type {FilesState} from '../src/lib/files.js'

test('MCP removal and restore use the same owner-scoped atomic 30-day Bin as the UI',async()=>{
 const fetchBefore=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,env=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
 process.env.SUPABASE_URL='https://bin-control.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';delete process.env.SUPABASE_SECRET_KEY
 let row:{revision:number;state:FilesState}={revision:1,state:{folders:[],files:[{id:'note',folderId:null,name:'My Note',format:'note',content:'Keep exactly',pinned:true,updatedAt:'2026-10-18T00:00:00Z'}],documents:[]}}
 let bin:any[]=[]
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);assert.equal(url.hostname,'bin-control.test')
  if(url.pathname.endsWith('/rpc/planner_files_bin_commit')){
   const args=await request.json() as any;assert.equal(args.p_username,'arin');assert.equal(args.p_revision,row.revision)
   row={state:args.p_state,revision:row.revision+1}
   if(args.p_add)bin.push({id:'12300000-0000-4000-8000-000000000001',names:args.p_add.names,snapshot:args.p_add.snapshot,item_count:args.p_add.itemCount,expires_at:'2099-01-01T00:00:00Z'})
   bin=bin.filter(entry=>!args.p_remove.includes(entry.id))
   return Response.json({revision:row.revision})
  }
  assert.equal(url.searchParams.get('username'),'eq.arin')
  if(url.pathname.endsWith('/planner_files'))return Response.json(row)
  assert.ok(url.pathname.endsWith('/planner_file_bin'));return Response.json(bin)
 }
 const server=createPlannerMcp('arin',['planner:read','planner:write']),client=new Client({name:'bin-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair()
 await server.connect(st);await client.connect(ct)
 try{
  const before=structuredClone(row.state)
  const trash=await client.callTool({name:'planner_trash_items',arguments:{ids:['note'],revision:1}})
  assert.ok(!trash.isError);assert.equal(row.state.files.length,0);assert.equal(bin.length,1)
  const list=await client.callTool({name:'planner_bin_read',arguments:{}})
  assert.ok(!list.isError);assert.equal((list.structuredContent as any).result.items[0].id,bin[0].id)
  const stale=await client.callTool({name:'planner_restore_items',arguments:{ids:[bin[0].id],revision:1}})
  assert.equal(stale.isError,true);assert.equal(bin.length,1)
  const restore=await client.callTool({name:'planner_restore_items',arguments:{ids:[bin[0].id],revision:2}})
  assert.ok(!restore.isError);assert.deepEqual(row.state,before);assert.equal(bin.length,0)
 }finally{await client.close();await server.close();globalThis.fetch=fetchBefore;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
