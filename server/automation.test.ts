import test from 'node:test'
import assert from 'node:assert/strict'
import { readAutomationSettings, updateAutomationSettings } from './automation.js'
import { scheduledReviewMessage, validateSchedule } from './vm-power.js'

test('real VM settings are owner scoped, partial changes preserve preferences, stale writes conflict',async()=>{
  const oldFetch=globalThis.fetch
  const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const
  const env=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
  process.env.SUPABASE_URL='https://automation.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
  let row={sources:['brightspace','slack'],schedule_enabled:true,schedule:{timezone:'America/New_York',times:['07:00','17:00'],instructions:'Give a daily checklist.'},updated_at:'2026-10-16T00:00:00.000Z',sites:{slack:{ready:true}}}
  let conflict=false,writes=0
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),u=new URL(request.url)
    assert.equal(u.hostname,'automation.test')
    if(request.method==='POST'){assert.equal((await request.json() as {username:string}).username,'arin');return new Response(null,{status:201})}
    assert.equal(u.searchParams.get('username'),'eq.arin')
    if(u.pathname.endsWith('/planner_agent_settings'))return new Response(null,{status:204})
    assert.ok(u.pathname.endsWith('/planner_vm_settings'))
    if(request.method==='GET')return Response.json(row)
    assert.equal(u.searchParams.get('updated_at'),'eq.'+row.updated_at)
    if(conflict)return Response.json([])
    row={...row,...await request.json() as typeof row};writes++
    return Response.json([{username:'arin'}])
  }
  try{
    const initial=await readAutomationSettings('arin');assert.deepEqual(initial.sources,['brightspace','slack']);assert.ok(initial.connections.slack.connected)
    const updated=await updateAutomationSettings('arin',{expectedUpdatedAt:initial.updatedAt,times:['08:30','08:30'],sources:['brightspace','slack','instagram']})
    assert.deepEqual(updated.times,['08:30']);assert.equal(updated.instructions,'Give a daily checklist.');assert.ok(!updated.connections.instagram.connected)
    await assert.rejects(()=>updateAutomationSettings('arin',{expectedUpdatedAt:initial.updatedAt,enabled:false}),/settings changed/)
    assert.equal(writes,1)
    await assert.rejects(()=>updateAutomationSettings('arin',{expectedUpdatedAt:updated.updatedAt,times:['25:00']}),/valid daily times/)
    await assert.rejects(()=>updateAutomationSettings('arin',{expectedUpdatedAt:updated.updatedAt,sources:[]}),/Choose sources/)
    conflict=true
    await assert.rejects(()=>updateAutomationSettings('arin',{expectedUpdatedAt:updated.updatedAt,instructions:'New checklist'}),/settings changed/)
    const schedule=validateSchedule({timezone:'UTC',times:['09:00'],instructions:'Include readings and exact times.'})
    assert.match(scheduledReviewMessage(schedule),/Include readings and exact times/)
    assert.match(scheduledReviewMessage(schedule),/Do not invent deadlines/)
  }finally{globalThis.fetch=oldFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
