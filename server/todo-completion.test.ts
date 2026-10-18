import test from 'node:test'
import assert from 'node:assert/strict'
import {completedTodoTasks,removeCompletedTodoBlocks,todoChecklist} from './todo-completion.js'
import type {FilesState} from '../src/lib/files.js'
import type {PlanningTask} from '../src/lib/planning.js'
import type {CalendarEvent} from '../src/types.js'

const note=(content:string):FilesState=>({folders:[],files:[{id:'note1',systemRole:'todo',name:'Renamed list',folderId:null,format:'note',content,updatedAt:''}]})
test('To do links survive urgency, formatting and order changes without matching unrelated tasks',()=>{
 const files=note('- [x] [urgency:90] **Buy water**\n- [ ] Do homework\n```\n- [x] Not a real task\n```')
 const items=todoChecklist(files)
 assert.equal(items.length,2);assert.equal(items[0].urgency,90)
 const task={id:'task1',title:'A different display title',source:items[0].source} as PlanningTask
 assert.deepEqual([...completedTodoTasks(files,[task,{...task,id:'other',source:'unrelated'}])],['task1'])
 assert.equal(todoChecklist(note('- [ ] [urgency:10] Buy water'))[0].source,items[0].source)
 assert.equal(completedTodoTasks(note('- [x] Buy water\n- [ ] Buy water'),[task]).size,0)
 assert.equal(completedTodoTasks(note('- [ ] Buy water'),[task]).size,0)
})
test('completion clears linked future and ongoing one-off blocks, preserving history, recurrence and unrelated events',()=>{
 const event=(id:string,start:string,end:string,taskId='task1',frequency='none')=>({id,start,end,planning:{taskId,locked:true,kind:'task'},recurrence:{frequency}} as CalendarEvent)
 const events=[event('past','2026-10-17T10:00:00Z','2026-10-17T11:00:00Z'),event('ongoing','2026-10-19T10:00:00Z','2026-10-19T11:00:00Z'),event('future','2026-11-01T10:00:00Z','2026-11-01T11:00:00Z'),event('recurring','2026-10-20T10:00:00Z','2026-10-20T11:00:00Z','task1','daily'),event('unrelated','2026-10-20T10:00:00Z','2026-10-20T11:00:00Z','other')]
 assert.deepEqual(removeCompletedTodoBlocks(events,new Set(['task1']),Date.parse('2026-10-19T10:30:00Z')).map(e=>e.id),['past','recurring','unrelated'])
})
