import test from 'node:test'
import assert from 'node:assert/strict'
import {readAgentInstructions,saveAgentInstructions} from './agent-instructions.js'
test('live instructions are owner-scoped, revision checked, read back and cleared',async()=>{
 process.env.SUPABASE_URL='https://instructions.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const originalFetch=globalThis.fetch
 let row:any=null
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  if(req.method==='GET'){assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json(row)}
  assert.equal(url.pathname,'/rest/v1/rpc/planner_save_agent_instructions')
  const args=await req.json() as any;assert.equal(args.p_username,'owner')
  if(args.p_revision!==(row?.revision||0))return Response.json({code:'P0001',message:'Changed'},{status:400})
  row={content:args.p_content,revision:(row?.revision||0)+1,updatedAt:new Date().toISOString()};return Response.json({...row,saved:true})
 }
 try{
  assert.equal((await readAgentInstructions('owner')).content,'')
  await saveAgentInstructions('owner',{revision:0,content:'Use shorter planning summaries.'})
  assert.equal((await readAgentInstructions('owner')).content,'Use shorter planning summaries.')
  await assert.rejects(()=>saveAgentInstructions('owner',{revision:0,content:'Stale'}),/changed/)
  await saveAgentInstructions('owner',{revision:1,content:''});assert.equal((await readAgentInstructions('owner')).content,'')
 }finally{globalThis.fetch=originalFetch}
})
