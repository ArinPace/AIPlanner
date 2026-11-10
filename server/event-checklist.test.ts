import test from 'node:test'
import assert from 'node:assert/strict'
import {completeChecklistBlocks,linkChecklistBlocks} from './event-checklist.js'
import {checklistItems} from '../src/lib/checklistItems.js'
import {mergeAdjacentEvents} from '../src/lib/eventFolders.js'
import {calendarScheduleIdentity} from '../src/lib/eventChecklist.js'
import {todoChecklist} from './todo-completion.js'
import type {CalendarEvent,StoredState} from '../src/types.js'
import type {PlannerTextFile} from '../src/lib/files.js'
const item='11111111-1111-4111-8111-111111111111'
const note:PlannerTextFile={id:'work',systemRole:'work',format:'note',name:'Work',folderId:null,updatedAt:'2026-11-10T12:00:00Z',content:`- [ ] [urgency:90] [item:${item}] Assignment — 90 minutes remaining\n- [ ] Another assignment`}
function event(id:string,start='2026-11-10T13:00:00Z',end='2026-11-10T14:00:00Z'):CalendarEvent{return {id,title:'Same name',description:'',start,end,allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null},checklistLinks:[{noteId:'work',itemId:item}]}}
const state=(...events:CalendarEvent[]):StoredState=>({events,tags:[],hiddenTagIds:[]})
const done=(eventId:string,occurrenceStart='2026-11-10T13:00:00Z')=>({eventId,occurrenceStart,revision:1})
test('multiple required blocks check parent only after last block; repeated clicks are idempotent',()=>{
 const c=state(event('a'),event('b','2026-11-11T13:00:00Z','2026-11-11T14:00:00Z'))
 const first=completeChecklistBlocks(c,[note],done('a'));assert.equal(first.notes.length,0);assert.equal(first.progress[0].completed,1);assert.equal(first.progress[0].checked,false)
 assert.equal(completeChecklistBlocks(first.calendar,[note],done('a')).changed,false)
 const last=completeChecklistBlocks(first.calendar,[note],done('b','2026-11-11T13:00:00Z'));assert.equal(checklistItems(last.notes[0].content)[0].checked,true);assert.equal(checklistItems(last.notes[0].content)[1].checked,false)
})
test('same titles never imply a link; stale or ambiguous item IDs make no changes',()=>{
 const other=event('other');other.checklistLinks=[{noteId:'work',itemId:'22222222-2222-4222-8222-222222222222'}]
 assert.throws(()=>completeChecklistBlocks(state(other),[note],done('other')),/removed or changed/)
 assert.throws(()=>completeChecklistBlocks(state(event('a')),[{...note,content:note.content+'\n'+note.content}],done('a')),/removed or changed/)
 const unlinked=event('u');delete unlinked.checklistLinks;assert.throws(()=>completeChecklistBlocks(state(unlinked),[note],done('u')),/no current checklist link/)
})
test('folder Done checks linked leaves but not unrelated blocks; outside required blocks stay pending',()=>{
 const folder={...event('folder'),eventKind:'folder' as const,end:'2026-11-10T16:00:00Z',checklistLinks:undefined}
 const child={...event('child'),folderId:'folder'};const other=event('outside','2026-11-11T13:00:00Z','2026-11-11T14:00:00Z')
 const result=completeChecklistBlocks(state(folder,child,other),[note],done('folder'))
 assert.equal(result.blocks,1);assert.equal(result.progress[0].checked,false);assert.equal(result.calendar.events.find(e=>e.id==='outside')!.completedStarts,undefined)
})
test('recurring folder records only selected occurrence and never completes infinite routine',()=>{
 const folder={...event('folder'),eventKind:'folder' as const,recurrence:{frequency:'daily' as const,interval:1,until:null},checklistLinks:undefined}
 const child={...event('child'),folderId:'folder'}
 const result=completeChecklistBlocks(state(folder,child),[note],done('folder','2026-11-11T13:00:00Z'))
 assert.equal(result.notes.length,0);assert.equal(result.progress[0].recurring,true);assert.deepEqual(result.calendar.events[1].completedStarts!.map(Date.parse),[Date.parse('2026-11-11T13:00:00.000Z')])
 assert.throws(()=>completeChecklistBlocks(state(folder,child),[note],done('folder','2026-11-11T13:01:00Z')),/no current checklist/)
})
test('link installs stable invisible ID preserving rich formatting and checks survive label/time changes',()=>{
 const n={...note,content:'- [ ] [urgency:90] Original',richTextSource:'- [ ] [urgency:90] Original',richText:JSON.stringify({type:'doc',content:[{type:'taskList',content:[{type:'taskItem',attrs:{checked:false,urgency:90},content:[{type:'paragraph',content:[{type:'text',text:'Original',marks:[{type:'bold'}]}]}]}]}]})}
 const linked=linkChecklistBlocks(state({...event('a'),checklistLinks:undefined}),n,{calendarRevision:1,filesRevision:1,noteId:'work',itemIndex:0,itemText:'Original',eventIds:['a']})
 const repeated=linkChecklistBlocks(linked.calendar,linked.note,{calendarRevision:2,filesRevision:2,noteId:'work',itemIndex:0,itemText:'Original',eventIds:['a']},'2030-01-01T00:00:00Z');assert.deepEqual(repeated.calendar,linked.calendar);assert.deepEqual(repeated.note,linked.note)
 const doc=JSON.parse(linked.note.richText!);assert.equal(doc.content[0].content[0].attrs.checklistId,linked.itemId);assert.equal(doc.content[0].content[0].content[0].content[0].marks[0].type,'bold')
 const renamed={...linked.note,content:linked.note.content.replace('Original','Renamed — 20 minutes remaining')};delete renamed.richText;delete renamed.richTextSource
 const result=completeChecklistBlocks(linked.calendar,[renamed],done('a'));assert.equal(checklistItems(result.notes[0].content)[0].checked,true)
 assert.throws(()=>linkChecklistBlocks(linked.calendar,linked.note,{calendarRevision:1,filesRevision:1,noteId:'work',itemIndex:0,itemText:'Wrong row',eventIds:['a']}),/row changed/)
})
test('automatic completion remains authoritative without manually checking every block',()=>{
 const checked={...note,content:note.content.replace('- [ ]','- [x]')}
 const result=completeChecklistBlocks(state(event('a'),event('b','2026-11-11T13:00:00Z','2026-11-11T14:00:00Z')),[checked],done('a'));assert.equal(result.progress[0].checked,true);assert.equal(result.notes.length,0)
})
test('stable marker does not change existing To-do source hash and merges cannot erase check state',()=>{
 const base={...note,id:'todo',systemRole:'todo' as const,content:'- [ ] Original'}
 const a=todoChecklist({folders:[],files:[base]})[0],b=todoChecklist({folders:[],files:[{...base,content:`- [ ] [item:${item}] Original`}]})[0];assert.equal(a.source,b.source);assert.equal(b.title,'Original')
 const e=event('a'),next=event('b',e.end,'2026-11-10T15:00:00Z');next.completedStarts=[next.start];assert.equal(mergeAdjacentEvents([e,next]).length,2);assert.equal(mergeAdjacentEvents([e,{...next,completedStarts:undefined}]).length,2,'individually linked blocks retain their independent Done controls')
})

test('Google review identity ignores progress only, never timing, tags or task identity',()=>{
 const original=state(event('a')),progress=structuredClone(original);progress.events[0].completedStarts=[progress.events[0].start];progress.events[0].checklistLinks=[]
 assert.equal(calendarScheduleIdentity(original),calendarScheduleIdentity(progress))
 progress.events[0].end='2026-11-10T15:00:00Z';assert.notEqual(calendarScheduleIdentity(original),calendarScheduleIdentity(progress))
 progress.events[0].end=original.events[0].end;progress.events[0].tagIds=['other'];assert.notEqual(calendarScheduleIdentity(original),calendarScheduleIdentity(progress))
})
