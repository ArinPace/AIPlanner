import test from 'node:test'
import assert from 'node:assert/strict'
import type {CalendarEvent} from '../src/types.js'
import {normalizeEventFolders,occurrenceFolderGroups,folderExpanded,saveEventGroup,validateEventFolders,folderOccurrenceKey} from '../src/lib/eventFolders.js'
import {expandEvents} from '../src/lib/recurrence.js'
const event=(id:string,extra:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:id,description:'',start:'2026-10-27T14:00:00Z',end:'2026-10-27T14:30:00Z',allDay:false,tagIds:[],scheduleType:'planned',recurrence:{frequency:'none',interval:1,until:null},...extra})
test('folders retain real child IDs and task links, derive bounds and keep removed children',()=>{
 const child=event('work',{folderId:'folder',planning:{kind:'task',taskId:'task',locked:false}}),folder=event('folder',{eventKind:'folder'})
 let events=normalizeEventFolders([folder,child,event('later',{folderId:'folder',start:'2026-10-27T15:00:00Z',end:'2026-10-27T15:30:00Z'})])
 assert.equal(events[0].end,'2026-10-27T15:30:00.000Z')
 events=saveEventGroup(events,{...folder,title:'Renamed'},[child])
 assert.equal(events.length,3);assert.equal(events.find(e=>e.id==='later')?.folderId,null)
 assert.deepEqual(events.find(e=>e.id==='work')?.planning,child.planning)
 events=saveEventGroup(events,{...folder,eventKind:undefined})
 assert.equal(events.find(e=>e.id==='work')?.folderId,null);assert.equal(events.length,3)
})
test('collapsed folder groups hide duplicate rows; hidden or missing containers never hide child events; current time forces expansion',()=>{
 const events=normalizeEventFolders([event('folder',{eventKind:'folder'}),event('work',{folderId:'folder'})])
 const occurrences=expandEvents(events,new Date('2026-10-27T00:00Z'),new Date('2026-10-28T00:00Z'))
 const groups=occurrenceFolderGroups(occurrences)
 assert.deepEqual(groups.top.map(item=>item.event.id),['folder']);assert.equal(groups.children.get('folder')?.length,1)
 assert.equal(occurrenceFolderGroups(occurrences.filter(item=>item.event.id!=='folder')).top[0].event.id,'work')
 const folder=groups.top[0]
 assert.equal(folderExpanded(folder,Date.parse('2026-10-27T14:00Z'),new Set()),true)
 assert.equal(folderExpanded(folder,Date.parse('2026-10-27T14:30Z'),new Set()),false)
 assert.equal(folderExpanded(folder,Date.parse('2026-10-27T15:30Z'),new Set(['folder'])),true)
 validateEventFolders([event('repeat',{eventKind:'folder',recurrence:{frequency:'daily',interval:1,until:null}})])
})
test('nested folders update ancestor ranges bottom-up, preserve subtree relationships and reject cycles',()=>{
 const root=event('root',{eventKind:'folder'}),inner=event('inner',{eventKind:'folder',folderId:'root'}),deep=event('deep',{eventKind:'folder',folderId:'inner'}),work=event('work',{folderId:'deep',start:'2026-10-27T16:00:00Z',end:'2026-10-27T17:00:00Z',planning:{kind:'task',taskId:'task',locked:false}})
 const normalized=normalizeEventFolders([root,inner,deep,work])
 for(const id of ['root','inner','deep']){assert.equal(normalized.find(e=>e.id===id)?.start,work.start.replace('Z','.000Z'));assert.equal(normalized.find(e=>e.id===id)?.end,work.end.replace('Z','.000Z'))}
 validateEventFolders(normalized)
 const occurrences=expandEvents(normalized,new Date('2026-10-27T00:00Z'),new Date('2026-10-28T00:00Z')),groups=occurrenceFolderGroups(occurrences)
 assert.deepEqual(groups.top.map(item=>item.event.id),['root']);assert.equal(groups.children.get('root')?.[0].event.id,'inner');assert.equal(groups.children.get('inner')?.[0].event.id,'deep')
 const saved=saveEventGroup(normalized,{...root,title:'Renamed'},[inner,deep,work])
 assert.equal(saved.find(e=>e.id==='deep')?.folderId,'inner');assert.deepEqual(saved.find(e=>e.id==='work')?.planning,work.planning)
 const removed=saveEventGroup(saved,root,[inner,deep])
 assert.equal(removed.find(e=>e.id==='work')?.folderId,null)
 const ungrouped=saveEventGroup(saved,root,[])
 assert.equal(ungrouped.find(e=>e.id==='inner')?.folderId,null);assert.equal(ungrouped.find(e=>e.id==='deep')?.folderId,'inner');assert.equal(ungrouped.length,4)
 assert.throws(()=>normalizeEventFolders([{...root,folderId:'deep'},inner,deep,work]),/parent folders/)
 assert.throws(()=>validateEventFolders([{...root,folderId:'deep'},inner,deep,work]),/parent folders/)
})

test('recurring nested folders repeat their children once and group each occurrence independently',()=>{
 const events=normalizeEventFolders([event('root',{eventKind:'folder',recurrence:{frequency:'daily',interval:2,until:'2026-10-31'}}),event('inner',{eventKind:'folder',folderId:'root'}),event('work',{folderId:'inner'})])
 validateEventFolders(events)
 assert.equal(events.find(e=>e.id==='work')?.recurrence.frequency,'daily')
 const items=expandEvents(events,new Date('2026-10-27T00:00Z'),new Date('2026-11-02T00:00Z')),groups=occurrenceFolderGroups(items)
 assert.equal(groups.top.length,3);assert.equal(items.length,9)
 for(const parent of groups.top){
  const inner=groups.children.get(folderOccurrenceKey(parent))!
  assert.equal(inner.length,1);assert.equal(inner[0].start.getTime(),parent.start.getTime())
  assert.equal(groups.children.get(folderOccurrenceKey(inner[0]))?.length,1)
 }
 const first=groups.top[0],second=groups.top[1]
 assert.equal(folderExpanded(first,0,new Set([folderOccurrenceKey(first)])),true)
 assert.equal(folderExpanded(second,0,new Set([folderOccurrenceKey(first)])),false)
 const edited=saveEventGroup(events,{...events[0],recurrence:{frequency:'weekly',interval:1,until:null}},events.slice(1))
 assert(edited.every(e=>e.recurrence.frequency==='weekly'))
})
test('recurring folder offsets retain local times across daylight saving and month boundaries',()=>{
 const events=normalizeEventFolders([event('root',{eventKind:'folder',recurrence:{frequency:'daily',interval:1,until:'2026-11-02'}}),event('work',{folderId:'root',start:'2026-10-31T13:00:00Z',end:'2026-10-31T13:30:00Z'})])
 const items=expandEvents(events,new Date('2026-10-31T00:00Z'),new Date('2026-11-03T00:00Z')).filter(i=>i.event.id==='work')
 assert.deepEqual(items.map(i=>new Date(i.start.getTime()).toISOString()),['2026-10-31T13:00:00.000Z','2026-11-01T14:00:00.000Z','2026-11-02T14:00:00.000Z'])
 const monthly=normalizeEventFolders([event('root',{eventKind:'folder',recurrence:{frequency:'monthly',interval:1,until:'2026-03-01'}}),event('work',{folderId:'root',start:'2026-01-31T23:00:00Z',end:'2026-02-01T01:00:00Z'}),event('later',{folderId:'root',start:'2026-02-01T01:00:00Z',end:'2026-02-01T02:00:00Z'})])
 const monthItems=expandEvents(monthly,new Date('2026-02-28T00:00Z'),new Date('2026-03-02T00:00Z'))
 assert.equal(new Date(monthItems.filter(i=>i.event.id==='later')[0].start.getTime()).toISOString(),'2026-03-01T01:00:00.000Z')
})
