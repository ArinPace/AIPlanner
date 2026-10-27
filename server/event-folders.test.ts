import test from 'node:test'
import assert from 'node:assert/strict'
import type {CalendarEvent} from '../src/types.js'
import {normalizeEventFolders,occurrenceFolderGroups,folderExpanded,saveEventGroup,validateEventFolders} from '../src/lib/eventFolders.js'
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
 assert.throws(()=>validateEventFolders([event('repeat',{eventKind:'folder',recurrence:{frequency:'daily',interval:1,until:null}})]),/cannot repeat/)
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
