import {completedTodoTasks,removeCompletedTodoBlocks,todoChecklist} from './todo-completion.js'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db,json,body} from './cloud.js'
import {storage} from './mcp-auth.js'
import {calendarRow} from './planner-workspace.js'
import {DEFAULT_PLANNING,type PlanningProfile} from '../src/lib/planning.js'
import {PlannerDate as Date} from '../src/lib/timezone.js'
import {toDateInput} from '../src/lib/dates.js'
import {buildDayPlan} from './day-planner.js'
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(new Date(v+'T00:00:00').getTime())&&toDateInput(new Date(v+'T00:00:00'))===v,'Use a real calendar date.')
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const score=z.number().int().min(0).max(100)
export const profilePatch=z.object({enabled:z.boolean().optional(),onboarded:z.boolean().optional(),wake:time.optional(),sleep:time.optional(),intensity:score.optional(),weekdays:z.array(score.nullable()).length(7).optional(),overrides:z.record(day,score).refine(v=>Object.keys(v).length<=400).optional(),recoveryUntil:day.nullable().optional(),goals:z.string().max(12000).optional(),preferences:z.string().max(12000).optional(),readyMinutes:z.number().int().min(0).max(180).optional(),windDownMinutes:z.number().int().min(0).max(180).optional(),meals:z.array(z.object({title:z.string().trim().min(1).max(80),time,minutes:z.number().int().min(5).max(180)})).max(10).optional(),breakActivities:z.array(z.string().trim().min(1).max(200)).min(1).max(30).optional()}).strict()
export const taskSchema=z.object({id:z.string().uuid().optional(),title:z.string().trim().min(1).max(300),category:z.string().trim().min(1).max(80),urgency:z.number().int().min(0).max(99),minutes:z.number().int().min(5).max(10080),deadline:z.string().datetime({offset:true}).nullable(),preferredDays:z.array(z.number().int().min(0).max(6)).max(7),earliestDate:day.nullable(),status:z.enum(['todo','done']),source:z.string().max(1000),goal:z.string().max(1000)})
export async function readPlanning(username:string,reconcile=true){
 if(reconcile)await syncTodoCompletion(username)
 storage(await db().from('planner_planning').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
 const row=storage(await db().from('planner_planning').select('state,revision,started_at').eq('username',username).single())
 const files=storage(await db().from('planner_files').select('state').eq('username',username).maybeSingle())
 return {profile:{...structuredClone(DEFAULT_PLANNING),...row.state} as PlanningProfile,revision:Number(row.revision),startedAt:row.started_at as string|null,todoChecklist:files?todoChecklist(files.state):[]}
}
async function save(username:string,revision:number,profile:PlanningProfile){
 const rows=storage(await db().from('planner_planning').update({state:profile,revision:revision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',revision).select('revision'))
 if(!rows.length)throw new ApiError(409,'Planning changed. Read the latest profile before retrying.')
 return {profile,revision:revision+1}
}

export async function syncTodoCompletion(username:string){
 for(let attempt=0;attempt<3;attempt++){
  const row=await readPlanning(username,false)
  const files=storage(await db().from('planner_files').select('state').eq('username',username).maybeSingle())
  if(!files)return
  const ids=completedTodoTasks(files.state,row.profile.tasks)
  if(!ids.size)return
  if(row.profile.tasks.some(task=>ids.has(task.id)&&task.status!=='done')){
   for(const task of row.profile.tasks)if(ids.has(task.id))task.status='done'
   try{await save(username,row.revision,row.profile)}catch(error){if(error instanceof ApiError&&error.status===409)continue;throw error}
  }
  // Checkbox completion clears linked work even when auto-replanning is off.
  // The initial calendar-start gate still applies to all automated writes.
  if(!row.startedAt)return
  const calendar=await calendarRow(username)
  const events=removeCompletedTodoBlocks(calendar.state.events,ids)
  if(events.length===calendar.state.events.length)return
  const result=await db().from('planner_calendars').update({state:{...calendar.state,events},revision:calendar.revision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',calendar.revision).select('revision')
  if(result.error)throw new ApiError(503,'Could not clear completed To do work from the calendar.')
  if(result.data?.length)return
 }
 throw new ApiError(409,'Planning changed while syncing To do completion. Retry with the latest state.')
}

export async function planDays(username:string,input:{date:string;days:number;preview?:boolean;revision:number}){
 const {date,days,preview}=z.object({date:day,days:z.number().int().min(1).max(14),preview:z.boolean().optional()}).parse(input)
 const row=await readPlanning(username)
 if(row.revision!==input.revision)throw new ApiError(409,'Read the latest planning profile before replanning.')
 if(!row.profile.onboarded)throw new ApiError(409,'First confirm waking/sleeping hours, goals, routine days, break preferences and task duration estimates with the user, then mark planning setup complete.')
 if(!preview&&!row.profile.enabled)throw new ApiError(409,'Turn on automatic planning before publishing a plan. Preview is still available.')
 if(!preview&&!row.startedAt)throw new ApiError(409,'The user must click Start planning my calendar in Main Chat before any calendar is populated.')
 const calendar=await calendarRow(username)
 const result=buildDayPlan(row.profile,calendar.state.events,date,days)
 for(const item of row.todoChecklist.filter(item=>!item.checked))if(!row.profile.tasks.some(task=>task.source===item.source&&task.status==='todo'))result.warnings.push(item.title+': unfinished To do item needs a linked task and duration estimate before it can be scheduled. Do not omit it from the plan review.')
 if(!preview){const saved=await db().rpc('planner_commit_day_plan',{p_username:username,p_revision:row.revision,p_calendar_revision:calendar.revision,p_calendar:{...calendar.state,events:result.events}});if(saved.error)throw new ApiError(409,saved.error.message)}
 return {saved:!preview,added:result.added,warnings:result.warnings,from:result.from,through:result.through,revision:preview?calendar.revision:calendar.revision+1,events:result.events.filter(e=>e.planning&&e.start>=new Date(date+'T00:00:00').toISOString())}
}
export async function changePlanning(username:string,input:{revision:number;patch?:unknown;task?:unknown;feedback?:unknown;recovery?:unknown;replan?:boolean}){
 const row=await readPlanning(username)
 if(row.revision!==input.revision)throw new ApiError(409,'Planning changed. Read it before retrying.')
 const profile=row.profile
 const oldOverrides={...profile.overrides}
 if(input.patch)Object.assign(profile,profilePatch.parse(input.patch))
 if(profile.sleep<=profile.wake)throw new ApiError(400,'Sleep time must follow wake time on the same day. Discuss an overnight routine in Main Chat.')
 if(input.task){const task=taskSchema.parse(input.task),existing=profile.tasks.find(t=>t.source===task.source&&t.title===task.title&&t.deadline===task.deadline&&t.earliestDate===task.earliestDate),id=task.id||existing?.id||randomUUID(),index=profile.tasks.findIndex(t=>t.id===id);if(task.id&&index<0)throw new ApiError(404,'Task not found. Omit id to create a new task.');if(index<0){if(profile.tasks.length>=1000)throw new ApiError(400,'Task limit reached.');profile.tasks.push({...task,id})}else profile.tasks[index]={...task,id}}
 if(input.feedback){
  const feedback=z.object({id:z.string().uuid(),taskId:z.string().uuid(),estimated:z.number().min(1).max(10080),actual:z.number().min(0).max(10080).nullable(),outcome:z.enum(['completed','missed']),completeTask:z.boolean().optional()}).parse(input.feedback)
  if(profile.feedback.some(f=>f.id===feedback.id))return {...row,duplicate:true}
  const task=profile.tasks.find(t=>t.id===feedback.taskId);if(!task)throw new ApiError(404,'Task not found.')
  if(feedback.outcome==='missed'){task.status='todo';task.urgency=Math.min(99,task.urgency+10)}else{
   if(feedback.completeTask!==false)task.status='done'
   if(feedback.actual!==null&&feedback.actual>0){const old=profile.learning[task.category]||{samples:0,ratio:1};const ratio=Math.max(.25,Math.min(4,old.ratio*feedback.actual/feedback.estimated));profile.learning[task.category]={samples:old.samples+1,ratio:Math.round((old.ratio*.7+ratio*.3)*100)/100}}
  }
  profile.feedback=[...profile.feedback,{...feedback,at:new Date().toISOString()}].slice(-200)
 }
 if(input.recovery){const recovery=z.object({through:day}).parse(input.recovery);profile.recoveryUntil=recovery.through}
 const saved=await save(username,row.revision,profile)
 let plan:Awaited<ReturnType<typeof planDays>>|null=null,replanError:string|null=null
 if(input.replan!==false&&row.startedAt&&profile.enabled&&profile.onboarded){
  try{
   const today=toDateInput(new Date())
   plan=await planDays(username,{date:today,days:7,revision:saved.revision})
   const weekEnd=new Date(today+'T00:00:00');weekEnd.setDate(weekEnd.getDate()+6)
   const extraDates=Object.keys({...oldOverrides,...profile.overrides}).filter(date=>oldOverrides[date]!==profile.overrides[date]&&date>toDateInput(weekEnd))
   for(const date of extraDates){const extra=await planDays(username,{date,days:1,revision:saved.revision});plan.warnings.push(...extra.warnings)}
  }catch(error){replanError=error instanceof Error?error.message:'Could not replan. Ask Main Chat to retry using the latest calendar.'}
 }
 return {...saved,startedAt:row.startedAt,saved:true,plan,replanError}
}
export async function handlePlanning(request:Request,username:string){
 if(request.method==='GET')return json(await readPlanning(username))
 if(request.method!=='POST')throw new ApiError(405,'Use GET or POST.')
 const input=await body(request)
 if(input.action==='start'){
  const {revision}=z.object({revision:z.number().int().nonnegative()}).parse(input)
  const result=await db().rpc('planner_start_calendar',{p_username:username,p_revision:revision})
  if(result.error)throw new ApiError(409,result.error.message)
  return json({...result.data,...await readPlanning(username)})
 }
 if(input.action==='plan')return json(await planDays(username,z.object({revision:z.number().int().nonnegative(),date:day,days:z.number().int().min(1).max(14),preview:z.boolean().optional()}).parse(input)))
 if(input.action==='reset-main'){
  if(input.confirm!=='RESET MAIN CHAT')throw new ApiError(400,'Confirm reset first.')
  const result=await db().rpc('planner_reset_main_chat',{p_username:username});if(result.error)throw new ApiError(409,result.error.message)
  return json({saved:true})
 }
 const args=z.object({revision:z.number().int().nonnegative(),patch:profilePatch.optional(),task:taskSchema.optional(),feedback:z.unknown().optional(),recovery:z.unknown().optional(),replan:z.boolean().optional()}).parse(input)
 return json(await changePlanning(username,args))
}
