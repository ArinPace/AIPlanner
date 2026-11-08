import test from 'node:test'
import assert from 'node:assert/strict'
import {whoopReportSchema,reportWhoopReview,WHOOP_RETRY_INSTRUCTIONS} from './whoop-review.js'
import {scheduledReviewMessage,shouldRunVm} from './vm-power.js'
test('WHOOP reports require fresh provenance and never equate missing sleep with awake',()=>{
 const now=new Date(),base={channel:'agent',expectedUpdatedAt:now.toISOString(),status:'pending',reconciled:false,detail:'Sleep still processing'}
 assert(whoopReportSchema.safeParse(base).success)
 assert(!whoopReportSchema.safeParse({...base,reconciled:true}).success)
 assert(!whoopReportSchema.safeParse({...base,status:'fresh'}).success)
 const fresh={...base,status:'fresh',reconciled:true,sourceUrl:'https://app.whoop.com/',timezone:'America/New_York',sleepStart:new Date(+now-9*3600000).toISOString(),sleepEnd:new Date(+now-3600000).toISOString(),actualSleepMinutes:420}
 assert(whoopReportSchema.safeParse(fresh).success)
 assert(!whoopReportSchema.safeParse({...fresh,sleepEnd:new Date(+now-72*3600000).toISOString()}).success)
 assert(!whoopReportSchema.safeParse({...fresh,sourceUrl:'https://app.whoop.com.evil.test'}).success)
 assert(!whoopReportSchema.safeParse({...fresh,actualSleepMinutes:600}).success)
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
 const metrics={...base,status:'fresh',sleepDate:date,actualSleepMinutes:462,sourceUrl:'https://app.whoop.com/athlete/123/sleep/1d/'+date+'/record',timezone:'America/New_York'}
 assert(whoopReportSchema.safeParse(metrics).success,'Fresh dated metrics remain reportable without invented endpoints')
 assert(!whoopReportSchema.safeParse({...metrics,reconciled:true}).success)
 assert(!whoopReportSchema.safeParse({...metrics,sleepDate:'2020-01-01'}).success)
 assert(!whoopReportSchema.safeParse({...metrics,actualSleepMinutes:undefined}).success)
 assert(!whoopReportSchema.safeParse({...metrics,sourceUrl:'https://app.whoop.com/athlete/123/1d/today'}).success)
 assert.match(scheduledReviewMessage({timezone:'America/New_York',times:['07:00']}),/planner_whoop_review_report/)
 assert.match(WHOOP_RETRY_INSTRUCTIONS,/Missing, stale or processing.*pending, never proof/)
 assert(shouldRunVm({scheduled:true,whoopAt:now.toISOString(),jobs:[]},now))
 assert(!shouldRunVm({scheduled:false,whoopAt:now.toISOString(),jobs:[]},now))
})
test('WHOOP reporting is owner-scoped, CAS protected, retains hourly retries until reconciled',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://whoop.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let state:any={updated_at:'2026-01-01T00:00:00Z'},writes=0
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),u=new URL(req.url);assert.equal(u.searchParams.get('username'),'eq.owner')
  if(u.pathname.endsWith('planner_vm_settings'))return Response.json({sources:['whoop'],schedule_enabled:true})
  assert.equal(u.searchParams.get('channel'),'eq.agent')
  if(req.method==='GET')return Response.json(state)
  assert.equal(u.searchParams.get('updated_at'),'eq.'+state.updated_at);state={...state,...await req.json() as any};writes++;return Response.json({username:'owner'})
 }
 try{
  await assert.rejects(()=>reportWhoopReview('owner',{channel:'agent',expectedUpdatedAt:'2025-01-01T00:00:00Z',status:'pending',reconciled:false,detail:'pending'}),/changed/);assert.equal(writes,0)
  const result=await reportWhoopReview('owner',{channel:'agent',expectedUpdatedAt:state.updated_at,status:'pending',reconciled:false,detail:'WHOOP processing'})
  assert(Math.abs(Date.parse(result.state.next_at)-Date.now()-3600000)<2000)
  const now=Date.now();await reportWhoopReview('owner',{channel:'agent',expectedUpdatedAt:state.updated_at,status:'fresh',reconciled:true,sourceUrl:'https://app.whoop.com/',timezone:'America/New_York',sleepStart:new Date(now-9*3600000).toISOString(),sleepEnd:new Date(now-3600000).toISOString(),detail:'Published and read back reconciled plan'})
  assert.equal(state.next_at,null);assert.equal(state.status,'fresh')
 }finally{globalThis.fetch=old;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
})
