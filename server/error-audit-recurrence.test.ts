import test from 'node:test'
import assert from 'node:assert/strict'
import {stageIssues} from './calendar-staging.js'
import type {CalendarEvent,StoredState} from '../src/types.js'
const item=(id:string,start:string,end:string,patch:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:id,description:'',start,end,allDay:false,tagIds:[],scheduleType:'fixed',recurrence:{frequency:'none',interval:1,until:null},...patch})
test('staging detects recurring future collisions while respecting outer-folder date exclusions',()=>{
 const folder=item('folder','2026-11-02T14:00:00-05:00','2026-11-02T15:00:00-05:00',{eventKind:'folder',recurrence:{frequency:'weekly',interval:1,until:'2026-11-30'},excludedStarts:['2026-11-09T14:00:00-05:00']})
 const child=item('class','2026-11-02T14:00:00-05:00','2026-11-02T15:00:00-05:00',{folderId:'folder'})
 const state:StoredState={events:[folder,child,item('appointment','2026-11-09T14:30:00-05:00','2026-11-09T15:00:00-05:00')],tags:[],hiddenTagIds:[]}
 const google={events:[],mappings:[],timeMin:'2026-11-08T00:00:00Z',timeMax:'2026-11-17T00:00:00Z'}
 assert.equal(stageIssues(state,google).filter(i=>i.id.startsWith('overlap:')).length,0)
 state.events.push(item('future-appointment','2026-11-16T14:30:00-05:00','2026-11-16T15:00:00-05:00'))
 const issues=stageIssues(state,google).filter(i=>i.id.startsWith('overlap:'))
 assert.equal(issues.length,1);assert.match(issues[0].message,/2026-11-16/)
})
