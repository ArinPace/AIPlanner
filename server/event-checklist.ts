import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {calendarRow} from './planner-workspace.js'
import {storage} from './mcp-auth.js'
import {DEFAULT_PLANNING,type PlanningProfile} from '../src/lib/planning.js'
import {readCanonicalNote} from './files-transfer.js'
import {checklistItems} from '../src/lib/checklistItems.js'
import {checklistLeaves,occurrenceChecked,repeatsWithAncestors} from '../src/lib/eventChecklist.js'
import {completedTodoTasks} from './todo-completion.js'
import type {PlannerTextFile,FilesState} from '../src/lib/files.js'
import type {StoredState} from '../src/types.js'
const iso=z.string().datetime({offset:true})
const linkArgs=z.object({calendarRevision:z.number().int().nonnegative(),filesRevision:z.number().int().nonnegative(),noteId:z.string().min(1).max(100),itemIndex:z.number().int().nonnegative(),itemText:z.string().min(1).max(2000),eventIds:z.array(z.string().min(1).max(100)).min(1).max(200),replaceLinks:z.boolean().optional()}).strict()
const doneArgs=z.object({revision:z.number().int().nonnegative(),eventId:z.string().min(1).max(100),occurrenceStart:iso}).strict()
// Preserve all rich formatting: change the target task item's attributes, not its document.
function patchNote(note:PlannerTextFile,index:number,itemId:string,checked:boolean|undefined,now:string){
 const copy=structuredClone(note),rows=checklistItems(copy.content),row=rows[index]
 if(!row)throw new ApiError(409,'Checklist changed. Read it before linking.')
 const lines=copy.content.split('\n');let line=lines[row.line]
 if(!row.id)line=line.replace(/(\[[ xX]\]\s+(?:\[urgency:\d{1,2}\]\s*)?)/,`$1[item:${itemId}] `)
 if(checked!==undefined)line=line.replace(/^(\s*(?:[-+*]|\d+[.)])\s+\[)[ xX](\])/,'$1'+(checked?'x':' ')+'$2')
 lines[row.line]=line;copy.content=lines.join('\n');copy.updatedAt=now
 if(copy.richText&&copy.richTextSource===note.content){
  const doc=JSON.parse(copy.richText);let ordinal=0
  const walk=(node:{type:string;attrs?:Record<string,unknown>;content?:typeof node[]})=>{
   if(node.type==='taskItem'){if(ordinal++===index)node.attrs={...node.attrs,checklistId:itemId,...(checked===undefined?{}:{checked})}}
   for(const child of node.content||[])walk(child)
  };walk(doc);copy.richText=JSON.stringify(doc);copy.richTextSource=copy.content
 }
 return copy
}
export function linkChecklistBlocks(calendar:StoredState,note:PlannerTextFile,args:z.infer<typeof linkArgs>,now=new Date().toISOString()){
 const rows=checklistItems(note.content),row=rows[args.itemIndex]
 if(!row||row.label!==args.itemText)throw new ApiError(409,'The selected checklist row changed. Read its current index and label.')
 if(row.id&&rows.filter(item=>item.id===row.id).length!==1)throw new ApiError(409,'Duplicate checklist item IDs; correct the note before linking.')
 const events=structuredClone(calendar.events),selected=events.filter(e=>args.eventIds.includes(e.id))
 if(selected.length!==new Set(args.eventIds).size||selected.some(e=>e.eventKind==='folder'||e.reminder||e.allDay))throw new ApiError(400,'Link existing timed activity blocks, not folders or reminders.')
 const itemId=row.id||randomUUID(),link={noteId:note.id,itemId}
 for(const event of selected)event.checklistLinks=[...(args.replaceLinks?[]:event.checklistLinks||[]).filter(old=>old.noteId!==note.id||old.itemId!==itemId),link]
 return {calendar:{...calendar,events},note:patchNote(note,args.itemIndex,itemId,undefined,now),itemId,linked:selected.length}
}
export function completeChecklistBlocks(calendar:StoredState,notes:PlannerTextFile[],args:z.infer<typeof doneArgs>,now=new Date().toISOString()){
 const copy=structuredClone(calendar),start=new Date(args.occurrenceStart),leaves=checklistLeaves(copy.events,args.eventId,start)
 if(!leaves.length)throw new ApiError(409,'This activity has no current checklist link. Ask Main Chat to link it to Work or To-do.')
 const links=new Map(leaves.flatMap(item=>item.event.checklistLinks||[]).map(link=>[link.noteId+':'+link.itemId,link]))
 for(const link of links.values()){
  const note=notes.find(n=>n.id===link.noteId),matches=note&&checklistItems(note.content).filter(row=>row.id===link.itemId)
  if(!matches||matches.length!==1)throw new ApiError(409,'A linked checklist item was removed or changed. Ask Main Chat to repair its link; nothing was checked off.')
 }
 let changed=false
 for(const leaf of leaves)if(!occurrenceChecked(leaf.event,leaf.start)){leaf.event.completedStarts=[...(leaf.event.completedStarts||[]),leaf.start.toISOString()];changed=true}
 const updates=new Map<string,PlannerTextFile>(),progress=[]
 for(const link of links.values()){
  const required=copy.events.filter(e=>e.eventKind!=='folder'&&e.checklistLinks?.some(l=>l.noteId===link.noteId&&l.itemId===link.itemId))
  const recurring=required.some(e=>repeatsWithAncestors(e,copy.events))
  const completed=required.filter(e=>!repeatsWithAncestors(e,copy.events)&&occurrenceChecked(e,new Date(e.start))).length
  const note=updates.get(link.noteId)||notes.find(n=>n.id===link.noteId)!,row=checklistItems(note.content).find(r=>r.id===link.itemId)!
  if(!recurring&&completed===required.length&&!row.checked){updates.set(note.id,patchNote(note,row.index,link.itemId,true,now));changed=true}
  progress.push({...link,completed,total:required.length,checked:row.checked||(!recurring&&completed===required.length),recurring})
 }
 return {calendar:copy,notes:[...updates.values()],progress,changed,blocks:leaves.length}
}
async function context(username:string){
 const [calendar,planning,todo,work]=await Promise.all([calendarRow(username),db().from('planner_planning').select('state,revision').eq('username',username).single(),readCanonicalNote(username,'todo') as Promise<FilesState>,readCanonicalNote(username,'work') as Promise<FilesState>])
 if(todo.revision!==work.revision)throw new ApiError(409,'Files changed. Retry with current notes.')
 const saved=storage(planning)
 return {calendar,planning:{profile:{...structuredClone(DEFAULT_PLANNING),...saved.state} as PlanningProfile,revision:Number(saved.revision)},filesRevision:todo.revision!,notes:[...todo.files,...work.files]}
}
async function commit(username:string,c:Awaited<ReturnType<typeof context>>,calendar:StoredState,notes:PlannerTextFile[],syncTasks=false){
 const files={folders:[],files:c.notes.map(n=>notes.find(v=>v.id===n.id)||n)}
 const profile=structuredClone(c.planning.profile)
 if(syncTasks){const done=completedTodoTasks(files,profile.tasks);for(const task of profile.tasks)if(done.has(task.id))task.status='done'}
 const {data,error}=await db().rpc('planner_commit_event_checks',{p_username:username,p_calendar_revision:c.calendar.revision,p_files_revision:c.filesRevision,p_planning_revision:c.planning.revision,p_calendar:calendar,p_notes:notes,p_planning:profile})
 if(error)throw new ApiError(error.code==='P0001'?409:503,error.code==='P0001'?'Your calendar or checklist changed. Refresh and retry.':'Could not save completion. Read current state before retrying.')
 return data as {calendarRevision:number;filesRevision:number}
}
export async function readChecklistLinks(username:string,noteId:string){const c=await context(username),note=c.notes.find(n=>n.id===noteId);if(!note)throw new ApiError(404,'Choose the canonical Work or To-do note.');return {calendarRevision:c.calendar.revision,filesRevision:c.filesRevision,noteId,items:checklistItems(note.content)}}
export async function linkEventChecklist(username:string,input:unknown){
 const args=linkArgs.parse(input),c=await context(username)
 if(c.calendar.revision!==args.calendarRevision||c.filesRevision!==args.filesRevision)throw new ApiError(409,'Calendar or Files changed. Read current revisions.')
 const note=c.notes.find(n=>n.id===args.noteId);if(!note)throw new ApiError(404,'Choose the canonical Work or To-do note.')
 const result=linkChecklistBlocks(c.calendar.state,note,args);const saved=await commit(username,c,result.calendar,[result.note]);return {saved:true,...saved,itemId:result.itemId,linked:result.linked}
}
export async function completeEventChecklist(username:string,input:unknown){
 const args=doneArgs.parse(input),c=await context(username)
 if(c.calendar.revision!==args.revision)throw new ApiError(409,'Calendar changed. Refresh before checking this block.')
 const result=completeChecklistBlocks(c.calendar.state,c.notes,args)
 if(!result.changed)return {saved:true,duplicate:true,revision:c.calendar.revision,progress:result.progress}
 const saved=await commit(username,c,result.calendar,result.notes,true)
 return {saved:true,revision:saved.calendarRevision,progress:result.progress,blocks:result.blocks}
}
export function registerEventChecklistTools(add:(name:string,description:string,schema:z.ZodRawShape,scope:string,readOnly:boolean,execute:(args:any)=>Promise<unknown>)=>void,username:string){
 add('planner_checklist_read','Read stable checklist IDs, row indices, labels, checked state and current calendar/Files revisions for the canonical Work or To-do note. Use before explicitly linking blocks; never guess from similar titles.',{noteId:z.string().min(1).max(100)},'planner:read',true,args=>readChecklistLinks(username,args.noteId))
 add('planner_link_event_checklist','Link every real required homework/preparation/To-do activity block to its exact Work or To-do checklist row. Read checklist first; pass exact itemText and itemIndex plus both revisions. The tool installs an invisible stable item ID, preserving formatting. Multiple blocks can share a row; the Done button checks the parent only when ALL linked non-recurring blocks are done. Link all required blocks before use, not just the current one. Link both Work and To-do when applicable; preserve item markers on note rewrites. No date/time or checkmarks change. Folders are containers: link their real children. Recurring routines record individual occurrences without permanently completing a series.',linkArgs.shape,'planner:write',false,args=>linkEventChecklist(username,args))
}
