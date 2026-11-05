import test from 'node:test'
import assert from 'node:assert/strict'
import {readAppSettings,updateAppSettings} from './app-settings-tools.js'
test('account settings preserve other fields, normalize offsets and reject stale/concurrent writes',async()=>{
 const original=globalThis.fetch
 process.env.SUPABASE_URL='https://app-settings.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 let row:any={week_scale_to_duration:false,month_scale_to_duration:false,task_notifications:null},writes=0,race=false
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);assert(url.pathname.endsWith('/planner_vm_settings'))
  if(req.method==='POST'){const value=await req.json() as any;assert.equal(value.username,'owner');assert.deepEqual(Object.keys(value),['username']);return new Response(null,{status:201})}
  assert.equal(url.searchParams.get('username'),'eq.owner')
  if(req.method==='GET')return Response.json(row)
  assert.equal(url.searchParams.get('week_scale_to_duration'),'eq.'+row.week_scale_to_duration)
  assert.equal(url.searchParams.get('task_notifications'),row.task_notifications===null?'is.null':'eq.'+JSON.stringify(row.task_notifications))
  if(race)return Response.json(null)
  const patch=await req.json() as any;assert(!('username'in patch));writes++;row={...row,...patch};return Response.json(row)
 }
 try{
  const expected=await readAppSettings('owner')
  const saved=await updateAppSettings('owner',{expected,display:{week:true},notifications:{...expected.notifications,enabled:true,minutes:[5,30,10,5]}})
  assert.equal(saved.display.week,true);assert.equal(saved.display.month,false);assert.deepEqual(saved.notifications.minutes,[30,10,5]);assert.equal(writes,1)
  await assert.rejects(()=>updateAppSettings('owner',{expected,display:{month:true}}),/settings changed/);assert.equal(writes,1)
  race=true;const latest=await readAppSettings('owner');await assert.rejects(()=>updateAppSettings('owner',{expected:latest,display:{month:true}}),/while saving/)
 }finally{globalThis.fetch=original}
})
