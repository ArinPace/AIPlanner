import test from 'node:test'
import assert from 'node:assert/strict'
import {resizeWidgetOccurrence,type TaskFeedback} from '../src/lib/widgetTaskFeedback.js'
import {normalizeEventFolders} from '../src/lib/eventFolders.js'
import {expandEvents} from '../src/lib/recurrence.js'
import type {CalendarEvent} from '../src/types.js'
const event=(id:string,patch:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:id,description:'',start:'2026-11-02T13:00:00.000Z',end:'2026-11-02T14:00:00.000Z',allDay:false,tagIds:['work'],scheduleType:'planned',recurrence:{frequency:'none',interval:1,until:null},...patch})
const feedback=(e:CalendarEvent,patch:Partial<TaskFeedback>={}):TaskFeedback=>({id:'test',task:{id:e.id+'@'+e.start,title:e.title,start:Date.parse(e.start)/1000,end:Date.parse(e.end)/1000},reportedAt:Date.parse('2026-11-02T13:30Z')/1000,remainingMinutes:60,done:false,...patch})
test('duration adjustment saves the exact end, preserves other tasks, and retries idempotently',()=>{
 const work=event('homework'),next=event('next',{start:'2026-11-02T14:00:00.000Z',end:'2026-11-02T15:00:00.000Z'})
 const input=feedback(work),change=resizeWidgetOccurrence([work,next],input)
 assert.equal(change.result.applied,true);assert.equal(change.result.end,'2026-11-02T14:30:00.000Z')
 assert.deepEqual(change.events.find(e=>e.id==='next'),next)
 assert.equal(work.end,'2026-11-02T14:00:00.000Z')
 assert.equal(resizeWidgetOccurrence(change.events,input).events,change.events)
})
test('Done shortens only the reported activity, and zero duration does not remove it',()=>{
 const work=event('homework')
 for(const done of [true,false]){
  const result=resizeWidgetOccurrence([work],feedback(work,{done,remainingMinutes:0}))
  assert.equal(result.events.length,1);assert.equal(result.events[0].end,'2026-11-02T13:30:00.000Z')
 }
})
test('newer edits and fixed commitments are delegated safely to the agent',()=>{
 const work=event('homework'),fixed=event('class',{scheduleType:'fixed',start:'2026-11-02T14:00:00.000Z',end:'2026-11-02T15:00:00.000Z'})
 assert.equal(resizeWidgetOccurrence([work,fixed],feedback(work)).result.applied,false)
 assert.equal(resizeWidgetOccurrence([{...work,end:'2026-11-02T14:10:00.000Z'}],feedback(work)).result.applied,false)
})
test('a child in a recurring folder changes for one date only; a retry reuses that occurrence',()=>{
 const events=normalizeEventFolders([event('folder',{eventKind:'folder',recurrence:{frequency:'daily',interval:1,until:null}}),event('homework',{folderId:'folder'})])
 const work=events.find(e=>e.id==='homework')!,input=feedback(work)
 const changed=resizeWidgetOccurrence(events,input)
 assert.equal(changed.result.applied,true)
 assert.equal(changed.events.filter(e=>e.detachedFrom==='homework').length,1)
 const range=[new Date('2026-11-02T00:00Z'),new Date('2026-11-04T00:00Z')] as const
 const occurrences=expandEvents(changed.events,...range).filter(o=>o.event.id==='homework')
 assert.equal(occurrences.length,1);assert.equal(occurrences[0].end.getTime(),Date.parse('2026-11-03T14:00:00.000Z'))
 assert.equal(resizeWidgetOccurrence(changed.events,input).events,changed.events)
})
test('exact widget end time preserves seconds instead of rounding a five-minute increment up',()=>{
 const work=event('homework'),report=Date.parse('2026-11-02T13:30Z')/1000
 const change=resizeWidgetOccurrence([work],feedback(work,{remainingMinutes:31,requestedEnd:report+30*60+15}))
 assert.equal(change.result.end,'2026-11-02T14:00:15.000Z')
})
