import test from 'node:test'
import assert from 'node:assert/strict'
import {readAgentMemory,saveAgentMemory} from './agent-memory.js'

test('memory is owner-scoped, paginated, revision checked and supports append/replacement',async()=>{
 const originalFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const,oldEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
 process.env.SUPABASE_URL='https://memory.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 let row:{content:string;revision:number;updated_at:string}|null=null
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  if(request.method==='GET'){
   assert.equal(url.pathname,'/rest/v1/planner_agent_memory');assert.equal(url.searchParams.get('username'),'eq.arin');return Response.json(row)
  }
  assert.equal(url.pathname,'/rest/v1/rpc/planner_save_agent_memory')
  const args=await request.json() as {p_username:string;p_revision:number;p_content:string;p_append:boolean}
  assert.equal(args.p_username,'arin')
  if(args.p_revision!==(row?.revision || 0))return Response.json({code:'P0001',message:'Memory changed'},{status:400})
  row={content:args.p_append&&row?.content?row.content+'\n'+args.p_content:args.p_content,revision:(row?.revision||0)+1,updated_at:'2026-10-19T00:00:00Z'}
  return Response.json({saved:true,revision:row.revision,totalCharacters:row.content.length})
 }
 try{
  assert.deepEqual(await readAgentMemory('arin'),{content:'',revision:0,updatedAt:null,offset:0,totalCharacters:0,hasMore:false})
  assert.equal((await saveAgentMemory('arin',{revision:0,content:'Confirmed preference'})).revision,1)
  await saveAgentMemory('arin',{revision:1,content:'Open question',mode:'append'})
  const first=await readAgentMemory('arin',{limit:10});assert.equal(first.content,'Confirmed ');assert.equal(first.hasMore,true)
  const last=await readAgentMemory('arin',{offset:10});assert.equal(first.content+last.content,'Confirmed preference\nOpen question');assert.equal(last.hasMore,false)
  await assert.rejects(()=>saveAgentMemory('arin',{revision:1,content:'Stale overwrite',mode:'replace'}),/Memory changed/)
  await saveAgentMemory('arin',{revision:2,content:'Corrected context',mode:'replace'});assert.equal((await readAgentMemory('arin')).content,'Corrected context')
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key]}}
})
