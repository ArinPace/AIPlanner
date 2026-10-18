import {createHash} from 'node:crypto'
import type {FilesState} from '../src/lib/files.js'
import type {PlanningTask} from '../src/lib/planning.js'
import type {CalendarEvent} from '../src/types.js'

function plain(text:string){return text.replace(/\[urgency:\d{1,2}\]\s*/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`~]/g,'').trim().replace(/\s+/g,' ').toLowerCase()}
export function todoChecklist(files:FilesState){
 const note=files.files.find(file=>file.systemRole==='todo')
 if(!note)return []
 const rows:{title:string;normalized:string;checked:boolean;urgency:number|null;source:string}[]=[]
 let fenced=false
 for(const line of note.content.split('\n')){
  if(/^\s*(```|~~~)/.test(line)){fenced=!fenced;continue}
  if(fenced)continue
  const match=line.match(/^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+(.+)$/)
  if(!match)continue
  const title=plain(match[2]);if(!title)continue
  const urgency=match[2].match(/\[urgency:(\d{1,2})\]/)
  rows.push({title:match[2].replace(/\[urgency:\d{1,2}\]\s*/g,'').trim(),normalized:title,checked:match[1].toLowerCase()==='x',urgency:urgency?Number(urgency[1]):null,source:'todo:'+note.id+':'+createHash('sha256').update(title).digest('hex')})
 }
 return rows
}
export function completedTodoTasks(files:FilesState,tasks:PlanningTask[]){
 const note=files.files.find(file=>file.systemRole==='todo')
 if(!note)return new Set<string>()
 const rows=todoChecklist(files)
 const completed=new Set<string>()
 for(const task of tasks){
  for(const item of rows){
   // Identical mixed-state items are ambiguous; never complete both by accident.
   if(!item.checked||rows.filter(row=>row.normalized===item.normalized).length!==1)continue
   if(task.source===item.source||(task.source.includes(note.id)&&plain(task.title)===item.normalized))completed.add(task.id)
  }
 }
 return completed
}
export function removeCompletedTodoBlocks(events:CalendarEvent[],ids:Set<string>,now=Date.now()){
 return events.filter(event=>!(event.planning?.taskId&&ids.has(event.planning.taskId)&&event.recurrence.frequency==='none'&&Date.parse(event.end)>now))
}
