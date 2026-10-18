import test from 'node:test'
import assert from 'node:assert/strict'
import {requireCalendarStarted} from './planning-gate.js'
test('agent calendar writes require the explicit start marker, not merely onboarding',async()=>{
 const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const,oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://planning-gate.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 let startedAt:string|null=null
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert.equal(url.pathname,'/rest/v1/planner_planning');assert.equal(url.searchParams.get('username'),'eq.arin');assert.equal(req.method,'GET');return Response.json({started_at:startedAt,state:{enabled:true,onboarded:true}})}
 try{await assert.rejects(()=>requireCalendarStarted('arin'),/click Start planning my calendar/);startedAt='2026-10-18T18:00:00Z';await requireCalendarStarted('arin')}finally{globalThis.fetch=oldFetch;for(const key of keys){if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key]}}
})
