import assert from 'node:assert/strict'
import test from 'node:test'
import {readAgentRunHistory} from './agent-run-history.js'

test('run history exposes current scheduled jobs, owner-scoped details and real pagination without runtime credentials',async()=>{
 const previousFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,env=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
 process.env.SUPABASE_URL='https://run-history.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 const id='1368bbea-a90d-4e9c-ad9c-4b18e16c6985'
 const calls:URL[]=[]
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);calls.push(url)
  assert.equal(request.method,'GET');assert.equal(url.searchParams.get('username'),'eq.arin')
  const selected=url.searchParams.get('select')!
  assert(!/lease|credential|host_id|thread_id|result/.test(selected))
  if(url.pathname.endsWith('planner_agent_runs'))return Response.json([{id:'legacy',summary:'Source update saved'}],{headers:{'Content-Range':'0-0/1'}})
  assert(url.pathname.endsWith('planner_vm_jobs'));assert.equal(url.searchParams.get('kind'),'in.(sync)')
  if(url.searchParams.has('id')){
   return url.searchParams.get('id')==='eq.'+id?Response.json({id,kind:'sync',message:'Execute saved review',reply:'Understood',status:'completed'}):Response.json(null)
  }
  return Response.json([{id,kind:'sync',reply:'x'.repeat(1600),status:'completed'}],{headers:{'Content-Range':'20-20/25'}})
 }
 try{
  const page=await readAgentRunHistory('arin',{kind:'sync',offset:20,limit:1})
  assert(page.runs);assert.equal(page.offset,20);assert.equal(page.total,25);assert.equal(page.hasMore,true)
  assert.equal(page.runs[0].outputTruncated,true);assert.equal(String(page.runs[0].outputSummary).length,1200)
  assert(!('message' in page.runs[0]));assert(!('reply' in page.runs[0]))
  assert.equal(calls[0].searchParams.get('offset'),'20');assert.equal(calls[0].searchParams.get('limit'),'1')
  const detail=await readAgentRunHistory('arin',{kind:'sync',jobId:id})
  assert('run' in detail);assert.equal((detail.run as any).message,'Execute saved review');assert.equal((detail.run as any).reply,'Understood')
  await assert.rejects(()=>readAgentRunHistory('arin',{kind:'sync',jobId:'00000000-0000-4000-8000-000000000001'}),/not found/)
  const legacy=await readAgentRunHistory('arin',{source:'collections'})
  assert(legacy.runs);assert.equal(legacy.source,'collections');assert.equal(legacy.runs[0].id,'legacy')
 }finally{globalThis.fetch=previousFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})

test('chat history includes scheduled reviews only when requested and retains account/chat boundaries',async()=>{
 const {registerPlannerControls}=await import('./planner-control.js')
 const previousFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,env=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
 process.env.SUPABASE_URL='https://chat-history.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 const chatId='1368bbea-a90d-4e9c-ad9c-4b18e16c6985',filters:string[]=[]
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  assert.equal(url.searchParams.get('username'),'eq.arin')
  if(url.pathname.endsWith('planner_vm_chats')){assert.equal(url.searchParams.get('id'),'eq.'+chatId);return Response.json({id:chatId,title:'Main Chat'})}
  assert(url.pathname.endsWith('planner_vm_jobs'));assert.equal(url.searchParams.get('chat_id'),'eq.'+chatId)
  filters.push(url.searchParams.get('kind')!);return Response.json([],{headers:{'Content-Range':'*/0'}})
 }
 try{
  const tools:Record<string,(args:any)=>Promise<unknown>>={}
  registerPlannerControls((name,_description,_schema,_scope,_readOnly,execute)=>{tools[name]=execute},'arin')
  await tools.planner_chat_messages({chatId})
  await tools.planner_chat_messages({chatId,includeScheduled:true})
  assert.deepEqual(filters,['in.(chat)','in.(chat,sync)'])
 }finally{globalThis.fetch=previousFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
