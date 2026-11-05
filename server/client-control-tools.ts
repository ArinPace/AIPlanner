import {z} from 'zod'
import {ApiError} from './cloud.js'
import {calendarRow} from './planner-workspace.js'
import {expandEvents} from '../src/lib/recurrence.js'
import {clientControlSchema} from '../src/lib/clientControlSchema.js'
type Add=(name:string,description:string,schema:z.ZodRawShape,scope:string,readOnly:boolean,execute:(args:any)=>Promise<unknown>)=>void
export function registerClientControlTools(add:Add,username:string){
 add('planner_client_control','Control the active Planner UI or this iPhone Screen Time. This returns an authenticated client command, NOT proof of execution: only the native Chat relay executes it and returns actual state. ui_read/ui_navigate visit all tabs and calendar date/view; ui_settings opens/closes Settings; ui_preferences changes local theme, visual zoom and fixed/planned filters with an expected UI snapshot. UI acknowledgements describe client state, not a completed cloud save; verify persisted data through its data tool. Screen Time read returns a state fingerprint; pass it as expected for writes. Start uses an absolute end (15 minutes–12 hours); existing sessions are preserved. Task windows must match a published calendar occurrence: sourceEventId, title and interval must match; omit task.id to have it generated canonically. Read native taskRules for the exact ID before removing. Task rules reuse the apps/categories/websites the user selected on this device; removal targets one occurrence ID. Location policies and saved NextDNS denylist can be changed. App tokens and API keys are never exposed. Apple authorization/app picking require user interaction: authorize/pick_apps open the native flow and do not claim choices made. Use read-back; unsupported clients must report unavailable, never pretend success. Calendar/Files/To-do/Work content edits use their normal Planner data tools, not UI clicks.',{command:clientControlSchema},'planner:write',false,async({command})=>{
  if(command.action==='screen_time_task_save'){
   const row=await calendarRow(username),task=command.task,start=Date.parse(task.start),end=Date.parse(task.end)
   const matches=expandEvents(row.state.events,new Date(start-1),new Date(start+1)).filter(o=>!o.event.allDay&&!o.event.reminder&&(!task.id||o.event.id+'@'+o.start.toISOString()===task.id)&&(o.event.detachedFrom||o.event.id)===task.sourceEventId&&o.event.title===task.title&&o.start.getTime()===start&&o.end.getTime()===end)
   const match=matches.length===1?matches[0]:null
   if(!match)throw new ApiError(409,'Read the published calendar and use its exact task occurrence ID, title and interval. Unsaved or invented task rules would be removed by calendar sync.')
   command.task.id=match.event.id+'@'+match.start.toISOString()
  }
  return {executed:false,requiresClient:true,clientAction:{version:1,command,issuedAt:new Date().toISOString()}}
 })
}
