import test from 'node:test'
import assert from 'node:assert/strict'
import {widgetSnapshot} from '../src/lib/widgetSnapshot.js'
import type {CalendarEvent} from '../src/types.js'
test('folder Screen Time windows stay available without turning folders into widget tasks',()=>{
 const base={description:'',allDay:false,tagIds:[],scheduleType:'planned' as const,recurrence:{frequency:'none' as const,interval:1,until:null}}
 const events:CalendarEvent[]=[{...base,id:'parent',title:'Folder',eventKind:'folder',start:'2037-01-05T15:00:00Z',end:'2037-01-05T15:30:00Z'},{...base,id:'child',title:'Child',folderId:'parent',start:'2037-01-05T15:00:00Z',end:'2037-01-05T15:30:00Z'}]
 const snapshot=widgetSnapshot(events,new Date('2037-01-05T14:00:00Z'))
 assert(snapshot.focusWindows.some(w=>w.sourceEventId==='parent'));assert(snapshot.focusWindows.some(w=>w.sourceEventId==='child'))
 assert(!snapshot.events.some(w=>w.sourceEventId==='parent'));assert(snapshot.events.some(w=>w.sourceEventId==='child'))
})

test('tag blocking inherits folder tags, expands future occurrences, and includes free gaps without changing widget tasks',()=>{
 const base={description:'',allDay:false,tagIds:[],scheduleType:'planned' as const,recurrence:{frequency:'none' as const,interval:1,until:null}}
 const start='2037-01-05T15:00:00Z',end='2037-01-05T15:30:00Z'
 const events:CalendarEvent[]=[{...base,id:'parent',title:'Folder',tagIds:['study'],eventKind:'folder',start,end},{...base,id:'child',title:'Child',folderId:'parent',start,end},{...base,id:'repeat',title:'Repeats',tagIds:['study'],start:'2037-01-05T16:00:00Z',end:'2037-01-05T16:30:00Z',recurrence:{frequency:'daily',interval:1,until:null}}]
 const snapshot=widgetSnapshot(events,new Date('2037-01-05T14:00:00Z'))
 assert(snapshot.focusWindows.find(w=>w.sourceEventId==='child')!.tagIds.includes('study'))
 assert(snapshot.focusWindows.filter(w=>w.sourceEventId==='repeat').length>1)
 const free=snapshot.focusWindows.filter(w=>w.tagIds.includes('__free_time__'))
 assert(free.length>0)
 assert(free.every(w=>!snapshot.events.some(e=>!e.isFreeTime&&e.start<w.end&&e.end>w.start)))
 assert(!snapshot.events.some(w=>w.sourceEventId.startsWith('free-time:')))
})

test('free-time blocking keeps the same identity during a gap and completed tasks release their original blocking identity',()=>{
 const event:CalendarEvent={id:'task',title:'Work',description:'',allDay:false,tagIds:[],start:'2037-01-05T15:00:00Z',end:'2037-01-05T15:30:00Z',recurrence:{frequency:'none',interval:1,until:null}}
 const first=widgetSnapshot([event],new Date('2037-01-05T14:00:00Z')),second=widgetSnapshot([event],new Date('2037-01-05T14:05:00Z'))
 const current=(snapshot:ReturnType<typeof widgetSnapshot>,time:number)=>snapshot.focusWindows.find(w=>w.tagIds.includes('__free_time__')&&w.start<=time&&w.end>time)!
 assert.equal(current(first,Date.parse('2037-01-05T14:00:00Z')/1000).id,current(second,Date.parse('2037-01-05T14:05:00Z')/1000).id)
 const done=widgetSnapshot([{...event,completedStarts:[event.start]}],new Date('2037-01-05T15:05:00Z'))
 assert(!done.focusWindows.some(w=>w.sourceEventId==='task'))
 assert(done.focusWindows.some(w=>w.sourceEventId==='free-time:completed:task'&&w.tagIds.includes('__free_time__')))
})
