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
