import test from 'node:test'
import assert from 'node:assert/strict'
import {readSubjectRollover,scheduleSubjectRollover,subjectRolloverMessage} from './subject-rollover.js'
import {scheduledReviewMessage,shouldRunVm} from './vm-power.js'
test('one-time subject schedule checks owner/revision and preserves independent daily reviews',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));process.env.SUPABASE_URL='https://rollover.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const row:any={revision:0,next_at:null};let writes=0
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert(url.pathname.endsWith('/planner_subject_rollovers'))
  if(req.method==='POST'){assert.deepEqual(await req.json(),{username:'owner'});return new Response(null,{status:204})}
  assert.equal(url.searchParams.get('username'),'eq.owner')
  if(req.method==='PATCH'){if(url.searchParams.get('revision')!=='eq.'+row.revision)return Response.json([]);Object.assign(row,await req.json());writes++;return Response.json([{username:'owner'}])}
  return Response.json(row)
 }
 try{assert.equal((await readSubjectRollover('owner')).revision,0);const scheduled=await scheduleSubjectRollover('owner',{expectedRevision:0,runAt:'2030-12-23T09:00:00-05:00',basis:'After the verified final assessment period',sources:['https://bulletins.nyu.edu/nyu/academic-calendar/']});assert.equal(scheduled.revision,1);assert.equal(writes,1)
 await assert.rejects(()=>scheduleSubjectRollover('owner',{expectedRevision:0,runAt:'2031-05-15T09:00:00-04:00',basis:'Next term',sources:['https://nyu.edu/']}),/changed/)
 await assert.rejects(()=>scheduleSubjectRollover('owner',{expectedRevision:1,runAt:'2020-01-01T09:00:00Z',basis:'Past',sources:['https://nyu.edu/']}),/future/)
 assert.match(subjectRolloverMessage(),/following turnover/)
 assert.match(scheduledReviewMessage({timezone:'America/New_York',times:['07:00']}),/grade-and-progress Note/)
 assert.match(scheduledReviewMessage({timezone:'America/New_York',times:['07:00']}),/one-time turnover/)
 }finally{globalThis.fetch=old;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
test('subject handoffs wake an idle VM even with daily review disabled',()=>{
 const now=new Date('2030-12-23T13:59:00Z'),input={jobs:[],scheduled:false}
 assert.equal(shouldRunVm(input,now),false)
 assert.equal(shouldRunVm({...input,rolloverAt:'2030-12-23T14:00:00Z'},now),true)
 assert.equal(shouldRunVm({...input,rolloverAt:'2031-05-15T13:00:00Z'},now),false)
})
