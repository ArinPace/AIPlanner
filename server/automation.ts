import { ApiError,db } from './cloud.js'
import { DEFAULT_REVIEW_INSTRUCTIONS, DEFAULT_VM_SCHEDULE, validateSchedule } from './vm-power.js'
import { VM_SOURCES } from '../src/lib/vm.js'

function checked<T>({data,error}:{data:T;error:unknown}):T{
  if(error)throw new ApiError(503,'Could not access your scheduled review settings.')
  return data
}
export async function automationRow(username:string){
  return checked(await db().from('planner_vm_settings').select('sources,schedule_enabled,schedule,updated_at,sites').eq('username',username).maybeSingle())
}
export async function readAutomationSettings(username:string){
  checked(await db().from('planner_vm_settings').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
  const row=await automationRow(username)
  if(!row)throw new ApiError(503,'Scheduled review settings are unavailable.')
  const schedule=row.schedule || DEFAULT_VM_SCHEDULE
  return {enabled:row.schedule_enabled,timezone:schedule.timezone,times:schedule.times,instructions:schedule.instructions || DEFAULT_REVIEW_INSTRUCTIONS,sources:row.sources,updatedAt:row.updated_at,connections:Object.fromEntries(row.sources.map((source:string)=>[source,{connected:row.sites?.[source]?.ready===true}]))}
}
export async function updateAutomationSettings(username:string,input:{expectedUpdatedAt:string;enabled?:boolean;timezone?:string;times?:string[];instructions?:string;sources?:string[]}){
  const current=await readAutomationSettings(username)
  if(current.updatedAt!==input.expectedUpdatedAt)throw new ApiError(409,'Review settings changed. Read planner_schedule_read before retrying.')
  if(!['enabled','timezone','times','instructions','sources'].some(key=>key in input))throw new ApiError(400,'Choose a schedule setting to change.')
  const sources=input.sources===undefined?current.sources:[...new Set(input.sources)]
  if(sources.some((source:string)=>!Object.hasOwn(VM_SOURCES,source)))throw new ApiError(400,'Choose supported source websites.')
  const enabled=input.enabled ?? current.enabled
  if(enabled && !sources.length)throw new ApiError(400,'Choose sources before enabling scheduled reviews.')
  let schedule
  try{schedule=validateSchedule({timezone:input.timezone ?? current.timezone,times:input.times ?? current.times,instructions:input.instructions ?? current.instructions})}catch(error){throw new ApiError(400,(error as Error).message)}
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()
  const rows=checked(await db().from('planner_vm_settings').update({schedule,schedule_enabled:enabled,...(input.sources===undefined?{}:{sources}),updated_at:updatedAt}).eq('username',username).eq('updated_at',input.expectedUpdatedAt).select('username'))
  if(!rows?.length)throw new ApiError(409,'Review settings changed. Read planner_schedule_read before retrying.')
  if(enabled)checked(await db().from('planner_agent_settings').update({schedule_enabled:false}).eq('username',username))
  return {...await readAutomationSettings(username),saved:true}
}
