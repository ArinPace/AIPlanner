import test from 'node:test'
import assert from 'node:assert/strict'
import {handleVmRequest} from './vm.js'
test('regular chat polling is read-only and avoids Files, note reconciliation and reply payloads',async()=>{
 process.env.SUPABASE_URL='https://poll.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const originalFetch=globalThis.fetch,now=new Date().toISOString()
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  assert.equal(req.method,'GET');assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(url.pathname.includes('/rpc/'),false)
  switch(table){
   case 'planner_vm_hosts':return Response.json([{id:'host',heartbeat_at:now,capabilities:{signedIn:true}}])
   case 'planner_vm_chats':return Response.json(url.searchParams.has('deleted_at')&&url.searchParams.get('deleted_at')!=='is.null'?[]:[{id:'main',title:'Main Chat',is_main:true}])
   case 'planner_vm_settings':return Response.json({ai_provider:'openai_api',sources:[],schedule:{times:['07:00']},schedule_enabled:true,sites:{}})
   case 'planner_vm_jobs':assert.equal((url.searchParams.get('select')||'').split(',').includes('reply'),false);return Response.json([{id:'job',chat_id:'main',status:'running',result:{},created_at:now}])
   case 'planner_vm_provisioning':return Response.json({status:'ready',power_state:'Running',power_updated_at:now})
   case 'planner_browser_accounts':case 'planner_google_accounts':return Response.json([])
   case 'planner_planning':return Response.json({started_at:now,revision:3,onboarded:true})
   default:throw Error('Polling touched unexpected table '+table)
  }
 }
 try{const r=await handleVmRequest(new Request('https://planner.test/api/agent/vm?poll=1'),'/api/agent/vm','owner');const result=await r.json() as any;assert.equal(result.queue.active.id,'job');assert.equal(result.planning.ready,true);assert.equal(result.planning.revision,3)}finally{globalThis.fetch=originalFetch}
})
