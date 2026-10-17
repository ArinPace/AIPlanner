import test from 'node:test'
import assert from 'node:assert/strict'
import type {CalendarEvent,Occurrence,Tag} from '../src/types.js'
import {yearDaySummary} from '../src/lib/yearCalendar.js'

const tags:Tag[]=[{id:'study',name:'Study',color:'#1a73e8'},{id:'work',name:'Work',color:'#d50000'},{id:'personal',name:'Personal',color:'#0b8043'}]
function occurrence(id:string,start:string,end:string,tagIds:string[]):Occurrence {
  const event:CalendarEvent={id,title:id,start,end,tagIds,description:'',allDay:false,recurrence:{frequency:'none',interval:1,until:null}}
  return {event,start:new Date(start),end:new Date(end)}
}
test('year bars include every visible tag color once, exclude hidden tags and use blue for untagged events',()=>{
  const day=new Date(2026,9,18),items=[occurrence('one','2026-10-18T09:00','2026-10-18T10:00',['study','work']),occurrence('two','2026-10-18T11:00','2026-10-18T12:00',['study']),occurrence('three','2026-10-18T13:00','2026-10-18T14:00',['personal'])]
  assert.deepEqual(yearDaySummary(day,items,tags,new Set()).segments.map(s=>s.color),tags.map(t=>t.color))
  const hidden=yearDaySummary(day,items,tags,new Set(['study','personal']))
  assert.equal(hidden.count,1)
  assert.deepEqual(hidden.segments,[{color:'#d50000',label:'Work'}])
  const plain=yearDaySummary(day,[occurrence('plain','2026-10-18T09:00','2026-10-18T10:00',[])],tags,new Set(tags.map(t=>t.id)))
  assert.equal(plain.count,1)
  assert.deepEqual(plain.segments,[{color:'#1a73e8',label:'Untagged'}])
})
test('multi-day and expanded recurring occurrences color only days they overlap, with midnight ends exclusive',()=>{
  const items=[occurrence('span','2026-10-17T12:00','2026-10-19T00:00',['work']),occurrence('repeat','2026-10-18T09:00','2026-10-18T10:00',['study']),occurrence('repeat','2026-10-25T09:00','2026-10-25T10:00',['study'])]
  const summary=(day:number)=>yearDaySummary(new Date(2026,9,day),items,tags,new Set())
  assert.equal(summary(17).count,1)
  assert.equal(summary(18).count,2)
  assert.equal(summary(19).count,0)
  assert.equal(summary(25).count,1)
  assert.equal(summary(26).count,0)
})
