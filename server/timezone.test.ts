import test from 'node:test'
import assert from 'node:assert/strict'
import { PlannerDate as Date } from '../src/lib/timezone.js'
import { addDays, combineDateAndTime, toDateInput, toTimeInput, startOfDay } from '../src/lib/dates.js'
import { expandEvent } from '../src/lib/recurrence.js'
import { scheduleSlot } from './vm-power.js'

test('calendar inputs and instants use New York regardless of machine timezone',()=>{
 assert.equal(combineDateAndTime('2026-07-15','23:59').getTime(),globalThis.Date.parse('2026-07-16T03:59:00Z'))
 assert.equal(combineDateAndTime('2026-01-15','23:59').getTime(),globalThis.Date.parse('2026-01-16T04:59:00Z'))
 const instant=new globalThis.Date('2026-10-19T02:30:00Z')
 assert.equal(toDateInput(instant),'2026-10-18');assert.equal(toTimeInput(instant),'22:30')
 assert.equal(startOfDay(instant).getTime(),globalThis.Date.parse('2026-10-18T04:00:00Z'))
 assert.equal(new Date(instant).toLocaleString('en-US',{timeZoneName:'short'}).includes('EDT'),true)
})
test('recurring wall-clock time and schedules follow both daylight-saving transitions',()=>{
 for(const [date,next,elapsed] of [['2026-03-07','2026-03-08',23],['2026-10-31','2026-11-01',25]] as const){
  const start=combineDateAndTime(date,'09:00'),tomorrow=addDays(start,1)
  assert.equal(toDateInput(tomorrow),next);assert.equal(toTimeInput(tomorrow),'09:00');assert.equal((+tomorrow-+start)/3600000,elapsed)
  const event={id:'r',title:'Reminder',description:'',reminder:true,allDay:false,start:start.toISOString(),end:new Date(+start+1).toISOString(),tagIds:[],recurrence:{frequency:'daily' as const,interval:1,until:null}}
  const items=expandEvent(event,start,new Date(+addDays(start,2)+1));assert.equal(items.length,3);assert.ok(items.every(item=>toTimeInput(item.start)==='09:00'))
 }
 assert.equal(scheduleSlot(new Date('2026-07-15T11:00:00Z'),undefined,false),'2026-07-15 07')
 assert.equal(scheduleSlot(new Date('2026-01-15T12:00:00Z'),undefined,false),'2026-01-15 07')
})

test('all-day recurring events retain local day boundaries across DST',()=>{
 const event={id:'day',title:'All day',description:'',allDay:true,start:new Date(2026,2,7).toISOString(),end:new Date(2026,2,8).toISOString(),tagIds:[],recurrence:{frequency:'daily' as const,interval:1,until:null}}
 const items=expandEvent(event,new Date(2026,2,7),new Date(2026,2,10))
 assert.equal(items.length,3)
 assert.ok(items.every(item=>item.start.getHours()===0 && item.end.getHours()===0))
 assert.equal((+items[1].end-+items[1].start)/3600000,23)
})
