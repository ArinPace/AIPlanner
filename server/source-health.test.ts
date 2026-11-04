import test from 'node:test'
import assert from 'node:assert/strict'
import {sourceAlerts} from '../src/lib/sourceAlerts.js'
import {reportSourceHealth,withSourceHealth} from './source-health.js'
import {ApiError} from './cloud.js'
import type {VmState} from '../src/lib/vm.js'
test('source alerts distinguish unknown access, disconnected sources, OAuth alternatives and pending review',()=>{
 const settings={sources:['brightspace','gmail','calendar'],sites:{brightspace:{ready:false,verifiedAt:'last-good'},gmail:{ready:false}}} as unknown as VmState['settings']
 const google={connected:true,activeAccountId:'account',accounts:[{id:'account',identity:'school@example.com',connected:true,canReadMail:true,readEnabled:true}]} as VmState['google']
 let result=sourceAlerts(settings,google,{},[])
 assert.equal(result.length,1);assert.equal(result[0].source,'brightspace');assert.match(result[0].message,/check failed/)
 settings.sites.brightspace={ready:true,verifiedAt:'recovered'}
 assert.equal(sourceAlerts(settings,google,{},[]).length,0)
 settings.sites.brightspace={ready:false,verifiedAt:'recovered'}
 assert.notEqual(sourceAlerts(settings,google,{},[])[0].id,result[0].id,'Recovered then failing again is a new visible episode')
 result=sourceAlerts(settings,google,{reviewRequired:true},[]);assert(result.some(i=>i.id.startsWith('calendar-review:')))
 result=sourceAlerts({...settings,sources:[]},google,{error:'Disconnected'},[{source:'brightspace',connection_key:'browser',incident_id:'incident',error:'Read failed',first_detected_at:''}]);assert.deepEqual(result,[])
 result=sourceAlerts(settings,google,{},[{source:'brightspace',connection_key:'browser',incident_id:'incident',error:'Read failed; login not confirmed',first_detected_at:''}]);assert.equal(result.filter(i=>i.source==='brightspace').length,1);assert.equal(result[0].id,'health:incident')
})
test('source failures and successful recovery are saved owner-scoped; validation errors do not become outages',async()=>{
 const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const reports:any[]=[]
 process.env.SUPABASE_URL='https://source-health.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init);assert(new URL(request.url).pathname.endsWith('/rpc/planner_report_source_health'));reports.push(await request.json());return Response.json(null)}
 try{
  await assert.rejects(()=>withSourceHealth('owner','gmail','account',async()=>{throw new ApiError(401,'Reconnect school email.')}),/Reconnect/)
  assert.deepEqual(reports[0],{p_username:'owner',p_source:'gmail',p_connection_key:'account',p_error:'Reconnect school email.'})
  await withSourceHealth('owner','gmail','account',async()=>({ok:true}));assert.equal(reports[1].p_error,null)
  await assert.rejects(()=>withSourceHealth('owner','calendar','account',async()=>{throw new ApiError(409,'Stale event revision.')}));assert.equal(reports.length,2)
  await assert.rejects(()=>reportSourceHealth('owner','unknown','browser','bad'));assert.equal(reports.length,2)
 }finally{globalThis.fetch=original;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
