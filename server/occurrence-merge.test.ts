
import test from 'node:test'
import assert from 'node:assert/strict'
import {removeCalendarItems} from './planner-control.js'
import {normalizeEventFolders,mergeAdjacentEvents,detachEventOccurrence,occurrenceFolderGroups,folderOccurrenceKey} from '../src/lib/eventFolders.js'
import {expandEvents} from '../src/lib/recurrence.js'
import {fixedEventPayload} from './fixed-event-payload.js'
import type {CalendarEvent,StoredState} from '../src/types.js'
const event=(id:string,patch:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:'Free time',description:'',start:'2026-10-31T13:00:00Z',end:'2026-10-31T14:00:00Z',allDay:false,tagIds:['break'],recurrence:{frequency:'daily',interval:1,until:'2026-11-03'},...patch})
const state=(events:CalendarEvent[]):StoredState=>({events,tags:[{id:'break',name:'Breaks',color:'#123456'}],hiddenTagIds:[]})
const range=[new Date('2026-10-31T00:00Z'),new Date('2026-11-04T00:00Z')] as const
test('one exact occurrence is excluded across DST without changing the series or other dates',()=>{
 const original=state([event('series')])
 const next=removeCalendarItems(original,['series'],'events','occurrence','2026-11-01T09:00:00-05:00')
 assert.equal(next.events.length,1);assert.deepEqual(next.events[0].recurrence,original.events[0].recurrence)
 assert.deepEqual(expandEvents(next.events,...range).map(item=>new Date(item.start.getTime()).toISOString()),['2026-10-31T13:00:00.000Z','2026-11-02T14:00:00.000Z','2026-11-03T14:00:00.000Z'])
 assert.equal(original.events[0].excludedStarts,undefined)
 assert.throws(()=>removeCalendarItems(original,['series'],'events','occurrence','2026-11-01T13:00:00Z'),/No occurrence/)
 assert.throws(()=>removeCalendarItems(original,['series'],'events','occurrence'),/exact occurrenceStart/)
 assert(fixedEventPayload(next.events[0]).recurrence.includes('EXDATE:20261101T140000Z'))
})
test('a child occurrence can be removed independently; skipping a folder hides and exports exclusions for descendants',()=>{
 const events=normalizeEventFolders([event('folder',{eventKind:'folder'}),event('child',{folderId:'folder',title:'Child'}),event('later',{folderId:'folder',title:'Later',start:'2026-10-31T14:00:00Z',end:'2026-10-31T14:30:00Z'})])
 const oneChild=removeCalendarItems(state(events),['later'],'events','occurrence','2026-11-01T15:00:00Z')
 const items=expandEvents(oneChild.events,...range),groups=occurrenceFolderGroups(items)
 assert.equal(items.filter(item=>item.event.id==='later').length,3);assert.equal(items.filter(item=>item.event.id==='child').length,4)
 assert.equal(groups.top.length,4)
 for(const parent of groups.top)assert((groups.children.get(folderOccurrenceKey(parent))?.length||0)>=1)
 const skipped=removeCalendarItems(state(events),['folder'],'events','occurrence','2026-11-01T14:00:00Z')
 assert.equal(expandEvents(skipped.events,...range).length,9)
 const child=skipped.events.find(e=>e.id==='later')!
 assert(fixedEventPayload(child).recurrence.includes('EXDATE:20261101T150000Z'))
})
test('adjacent matching blocks merge into a longer event, preserve content and source IDs, and are idempotent',()=>{
 const a=event('a',{recurrence:{frequency:'none',interval:1,until:null},description:'First',tagIds:['b','a']})
 const b=event('b',{...a,id:'b',start:a.end,end:'2026-10-31T15:00:00Z',description:'Second',tagIds:['a','b']})
 const c=event('c',{...b,id:'c',start:b.end,end:'2026-10-31T16:00:00Z'})
 const combined=mergeAdjacentEvents([c,b,a])
 assert.equal(combined.length,1);assert.equal(combined[0].start,a.start);assert.equal(combined[0].end,c.end)
 assert.deepEqual(combined[0].mergedEventIds,['b','c']);assert.equal(combined[0].description,'First\n\nSecond')
 assert.deepEqual(mergeAdjacentEvents(combined),combined)
 const otherTask={...b,planning:{kind:'task' as const,taskId:'other',locked:false}}
 assert.equal(mergeAdjacentEvents([a,otherTask]).length,2)
 assert.equal(mergeAdjacentEvents([a,{...b,title:'Different'}]).length,2)
 assert.equal(mergeAdjacentEvents([a,{...b,tagIds:['different']}]).length,2)
 assert.equal(mergeAdjacentEvents([a,{...b,start:'2026-10-31T14:01:00Z'}]).length,2)
})

test('removing a recurring folder series removes its entire nested subtree, leaving unrelated events',()=>{
 const events=normalizeEventFolders([event('root',{eventKind:'folder'}),event('inner',{eventKind:'folder',folderId:'root'}),event('work',{title:'Work',folderId:'inner'}),event('unrelated',{title:'Other'})])
 const removed=removeCalendarItems(state(events),['root'],'events','series')
 assert.deepEqual(removed.events.map(event=>event.id),['unrelated'])
 assert.equal(events.length,4)
 const skipped=removeCalendarItems(state(events),['root'],'events','occurrence','2026-11-01T14:00:00Z')
 for(const id of ['root','inner','work'])assert.equal(expandEvents(skipped.events,...range).filter(item=>item.event.id===id).length,3)
 assert.equal(expandEvents(skipped.events,...range).filter(item=>item.event.id==='unrelated').length,4)
})

test('detaching a recurring folder keeps a standalone subtree and leaves all other series dates intact',()=>{
 const original=normalizeEventFolders([event('root',{eventKind:'folder'}),event('nested',{eventKind:'folder',folderId:'root'}),event('work',{title:'Work',folderId:'nested'})])
 const detached=detachEventOccurrence(original,'root','2026-11-01T14:00:00Z')
 assert.equal(detached.event.recurrence.frequency,'none')
 assert.equal(detached.event.folderId,null)
 const clones=detached.events.filter(event=>event.detachedFrom)
 assert.equal(clones.length,3)
 assert.equal(clones.find(event=>event.detachedFrom==='work')?.folderId,clones.find(event=>event.detachedFrom==='nested')?.id)
 assert.equal(expandEvents(detached.events,...range).length,12)
 const deleted=removeCalendarItems(state(detached.events),[detached.event.id],'events','event')
 assert.equal(deleted.events.length,3)
 for(const id of ['root','nested','work'])assert.equal(expandEvents(deleted.events,...range).filter(item=>item.event.id===id).length,3)
 assert.equal(original[0].excludedStarts,undefined)
})
