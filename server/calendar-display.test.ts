import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarDisplaySettings} from './calendar-display.js'
import {durationHeight} from '../src/lib/calendarDisplay.js'
import type {Occurrence} from '../src/types.js'
test('display settings update only the chosen field for the authenticated owner',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://display.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const row={week_scale_to_duration:false,month_scale_to_duration:true}
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url);assert(url.pathname.endsWith('/planner_vm_settings'));if(request.method==='POST'){assert.deepEqual(await request.json(),{username:'owner'});return Response.json(null)}assert.equal(url.searchParams.get('username'),'eq.owner');if(request.method==='PATCH'){const patch=await request.json();assert.deepEqual(patch,{week_scale_to_duration:true});Object.assign(row,patch);return new Response(null,{status:204})}return Response.json(row)}
 try{assert.deepEqual(await calendarDisplaySettings('owner'),{week:false,month:true});assert.deepEqual(await calendarDisplaySettings('owner',{week:true}),{week:true,month:true});await assert.rejects(()=>calendarDisplaySettings('owner',{week:'yes'}))}finally{globalThis.fetch=old;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
test('duration sizing clips multi-day events and keeps all-day/reminders compact',()=>{
 const row=(start:number,end:number)=>({event:{allDay:false},start:new Date(start*60000),end:new Date(end*60000)}) as Occurrence
 assert.equal(durationHeight(row(0,120),'week',1,0,86400000),2*durationHeight(row(0,60),'week',1,0,86400000)!)
 assert.equal(durationHeight(row(0,120),'month',1,0,86400000),2*durationHeight(row(0,60),'month',1,0,86400000)!)
 assert.equal(durationHeight(row(-60,60),'week',1,0,86400000),60)
 assert.equal(durationHeight(row(0,1),'week',1,0,86400000),36)
 const allDay=row(0,1440);allDay.event.allDay=true;assert.equal(durationHeight(allDay,'week',1,0,86400000),undefined)
})
