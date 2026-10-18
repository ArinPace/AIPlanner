import test from 'node:test'
import assert from 'node:assert/strict'
import { expandEvent } from '../src/lib/recurrence.js'
import type { CalendarEvent } from '../src/types.js'

test('late reminders recur as points without spilling into the next day',()=>{
 const start=new Date(2026,9,18,23,59)
 const event:CalendarEvent={id:'deadline',title:'Deadline',description:'',reminder:true,allDay:false,start:start.toISOString(),end:new Date(+start+1).toISOString(),tagIds:[],recurrence:{frequency:'daily',interval:1,until:null}}
 const items=expandEvent(event,new Date(2026,9,18),new Date(2026,9,20))
 assert.equal(items.length,2)
 for(const item of items){assert.equal(item.start.getHours(),23);assert.equal(item.start.getMinutes(),59);assert.equal(+item.end-+item.start,1);assert.equal(item.start.getDate(),item.end.getDate())}
})
