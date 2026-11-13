import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {normalizeTaskNotifications} from '../src/lib/taskNotifications.js'
const display=z.object({week:z.boolean(),month:z.boolean()})
const notices=z.object({enabled:z.boolean(),switches:z.boolean(),advance:z.boolean(),longTaskMinutes:z.number().int().min(1).max(1440),minutes:z.array(z.number().int().min(1).max(1440)).min(1).max(10)})
const snapshot=z.object({display,notifications:notices})
const fields='week_scale_to_duration,month_scale_to_duration,task_notifications'
const normalized=(row:any)=>({display:{week:row?.week_scale_to_duration===true,month:row?.month_scale_to_duration===true},notifications:normalizeTaskNotifications(row?.task_notifications||{})})
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
export async function readAppSettings(username:string){return normalized(storage(await db().from('planner_vm_settings').select(fields).eq('username',username).maybeSingle()))}
export async function updateAppSettings(username:string,input:unknown){
 const args=z.object({expected:snapshot,display:display.partial().optional(),notifications:notices.optional()}).strict().refine(x=>x.display||x.notifications).parse(input)
 storage(await db().from('planner_vm_settings').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
 const row=storage(await db().from('planner_vm_settings').select(fields).eq('username',username).single())
 if(!same(normalized(row),args.expected))throw new ApiError(409,'App settings changed. Read current settings and preserve unrelated values before retrying.')
 const patch={...(args.display?.week===undefined?{}:{week_scale_to_duration:args.display.week}),...(args.display?.month===undefined?{}:{month_scale_to_duration:args.display.month}),...(args.notifications?{task_notifications:normalizeTaskNotifications(args.notifications)}:{})}
 let query=db().from('planner_vm_settings').update(patch).eq('username',username)
 for(const key of ['week_scale_to_duration','month_scale_to_duration','task_notifications'] as const)query=row[key]===null?query.is(key,null):query.eq(key,typeof row[key]==='object'?JSON.stringify(row[key]):row[key])
 const saved=storage(await query.select(fields).maybeSingle())
 if(!saved)throw new ApiError(409,'App settings changed while saving. Read them before retrying.')
 return {saved:true,...normalized(saved),permissions:'Saved app preferences do not grant iOS notification, Screen Time or location permissions. The user must approve any OS authorization prompt.'}
}
type Add=(name:string,description:string,schema:z.ZodRawShape,scope:string,readOnly:boolean,execute:(args:any)=>Promise<unknown>)=>void
export function registerAppSettingsTools(add:Add,username:string){
 add('planner_app_settings_read','Read this account calendar duration scaling and task notification preferences. Other controls use planner_planning_read, planner_schedule_read, planner_instructions_read, and Google Calendar tools. Native OS permissions, app selections and sign-in need user interaction.',{},'planner:read',true,()=>readAppSettings(username))
 add('planner_app_settings_update','Change this account week/month duration scaling or task notifications. Read app settings first and pass the complete expected snapshot; omitted display fields are preserved. Includes notification offsets and long-task threshold. Does not change any other account or grant OS permissions.',{expected:snapshot,display:display.partial().optional(),notifications:notices.optional()},'planner:write',false,args=>updateAppSettings(username,args))
 add('planner_notification_inbox_read','Read active source/sign-in issues shown in the Planner sidebar, including checked state. Resolving a source requires verified successful access via planner_source_report, not dismissing its notice.',{},'planner:read',true,async()=>{const response=await (await import('./notification-inbox.js')).notificationInbox(new Request('https://planner.internal/api/agent/notifications'),username);return response.json()})
 add('planner_notification_inbox_check','Check or uncheck one owned sidebar notification by its exact ID. This acknowledges it; it does not repair or clear the underlying source connection.',{id:z.string().min(1).max(2000),checked:z.boolean()},'planner:write',false,async args=>{const response=await (await import('./notification-inbox.js')).notificationInbox(new Request('https://planner.internal/api/agent/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}),username);return response.json()})
 add('planner_chat_schedule_read','Read subscription Chat review settings, enabled state, execution requirements and Agent schedule state. This foreground scheduler is separate from the VM Agent scheduler and ChatGPT cloud Tasks.',{},'planner:read',true,async()=> (await import('./subscription-schedule.js')).subscriptionScheduleSettings(username))
 add('planner_chat_schedule_update','Edit saved subscription Chat review settings with expectedUpdatedAt. Do not activate unless the user confirms sign-ins are ready. This does not create a ChatGPT cloud task or migrate Agent scheduling; the current Chat runner requires Planner open and rejects concurrent Agent schedules.',{expectedUpdatedAt:z.string().nullable(),enabled:z.boolean(),signInsReady:z.literal(true).optional(),schedule:z.unknown().optional()},'planner:write',false,async args=>(await import('./subscription-schedule.js')).subscriptionScheduleAction(username,{action:'schedule_update',...args}))

}
