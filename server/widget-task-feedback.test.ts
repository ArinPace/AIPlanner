import test from 'node:test'
import assert from 'node:assert/strict'
import {resizeWidgetOccurrence,verifyFreeTimeRequest,type TaskFeedback} from '../src/lib/widgetTaskFeedback.js'
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
 const replacement=changed.events.find(e=>e.detachedFrom==='homework')!,folder=changed.events.find(e=>e.detachedFrom==='folder')!
 assert.equal(replacement.folderId,folder.id)
 assert.equal(Date.parse(folder.end),Date.parse(replacement.end))
 assert.equal(expandEvents(changed.events,...[new Date('2026-11-02T00:00Z'),new Date('2026-11-03T00:00Z')] as const).filter(o=>o.event.id==='folder').length,0)
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

test('free-time requests accept gaps and explicit planned Free time, bounded by the next activity',()=>{
 const now=new Date('2026-11-02T13:30:00Z'),next=event('next',{start:'2026-11-02T14:00:00.000Z',end:'2026-11-02T15:00:00.000Z'})
 const request=feedback(event('slot'),{kind:'fillFreeTime'})
 assert.equal(verifyFreeTimeRequest([next],[],request,now).end,'2026-11-02T14:00:00.000Z')
 const free=event('free',{title:'Free time'})
 assert.equal(verifyFreeTimeRequest([free,next],[],request,now).end,'2026-11-02T14:00:00.000Z')
 assert.throws(()=>verifyFreeTimeRequest([event('busy')],[],request,now),/scheduled activity/)
 assert.throws(()=>verifyFreeTimeRequest([free,event('busy')],[],request,now),/scheduled activity/)
 assert.throws(()=>verifyFreeTimeRequest([event('rest',{title:'Rest',planning:{kind:'break',locked:false}})],[],request,now),/scheduled activity/)
 assert.throws(()=>verifyFreeTimeRequest([],[],request,new Date('2026-11-02T15:00Z')),/ended/)
})

test('shortening a class in a nested recurring folder preserves its commute, folder membership and future dates',()=>{
 const events=normalizeEventFolders([
  event('day',{eventKind:'folder',recurrence:{frequency:'daily',interval:1,until:null}}),
  event('class-folder',{eventKind:'folder',folderId:'day'}),
  event('commute',{folderId:'class-folder',title:'Commute',start:'2026-11-02T18:55:00.000Z',end:'2026-11-02T19:00:00.000Z'}),
  event('class',{folderId:'class-folder',title:'Commerce and Culture',scheduleType:'fixed',start:'2026-11-02T19:00:00.000Z',end:'2026-11-02T20:15:00.000Z'})])
 const original=events.find(e=>e.id==='class')!
 const request=feedback(original,{reportedAt:Date.parse('2026-11-02T20:04:00Z')/1000,remainingMinutes:6})
 const change=resizeWidgetOccurrence(events,request)
 assert.equal(change.result.applied,true)
 const current=expandEvents(change.events,new Date('2026-11-02T00:00Z'),new Date('2026-11-03T00:00Z'))
 const classes=current.filter(o=>o.event.title==='Commerce and Culture')
 assert.equal(classes.length,1)
 const edited=classes[0],folder=current.find(o=>o.event.id===edited.event.folderId)!
 assert(folder);assert.equal(edited.end.getTime(),Date.parse('2026-11-02T20:10:00Z'));assert.equal(folder.end.getTime(),edited.end.getTime())
 assert(current.some(o=>o.event.title==='Commute'&&o.event.folderId===folder.event.id))
 assert.equal(current.filter(o=>o.event.title==='class-folder').length,1)
 const future=expandEvents(change.events,new Date('2026-11-03T00:00Z'),new Date('2026-11-04T00:00Z')).find(o=>o.event.id==='class')!
 assert.equal(future.end.getTime(),Date.parse('2026-11-03T20:15:00Z'))
 assert.equal(resizeWidgetOccurrence(change.events,request).events,change.events)
})
