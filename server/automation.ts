import { ApiError,db } from './cloud.js'
import { DEFAULT_REVIEW_INSTRUCTIONS, DEFAULT_VM_SCHEDULE, validateSchedule } from './vm-power.js'
import { VM_SOURCES } from '../src/lib/vm.js'

function checked<T>({data,error}:{data:T;error:unknown}):T{
  if(error)throw new ApiError(503,'Could not access your scheduled review settings.')
  return data
}
export async function automationRow(username:string){
  return checked(await db().from('planner_vm_settings').select('sources,schedule_enabled,schedule,updated_at,sites,agent_hidden,subscription_schedule_enabled,subscription_schedule').eq('username',username).maybeSingle())
}
export async function readAutomationSettings(username:string){
  checked(await db().from('planner_vm_settings').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
  const row=await automationRow(username)
  if(!row)throw new ApiError(503,'Scheduled review settings are unavailable.')
  const schedule=(row.agent_hidden?row.subscription_schedule:row.schedule) || row.schedule || DEFAULT_VM_SCHEDULE
  return {enabled:row.agent_hidden?row.subscription_schedule_enabled:row.schedule_enabled,execution:row.agent_hidden?'foreground-chat':'agent',timezone:DEFAULT_VM_SCHEDULE.timezone,times:schedule.times,instructions:schedule.instructions || DEFAULT_REVIEW_INSTRUCTIONS,sources:row.sources,updatedAt:row.updated_at,connections:Object.fromEntries(row.sources.map((source:string)=>[source,{connected:row.sites?.[source]?.ready===true}]))}
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
  if(current.execution==='foreground-chat'&&enabled&&!current.enabled)throw new ApiError(409,'Enable Chat reviews in Chat settings after finishing your sign-ins. The agent cannot activate them during setup.')
  const patch=current.execution==='foreground-chat'?{subscription_schedule:schedule,subscription_schedule_enabled:enabled}:{schedule,schedule_enabled:enabled}
  const rows=checked(await db().from('planner_vm_settings').update({...patch,...(input.sources===undefined?{}:{sources}),updated_at:updatedAt}).eq('username',username).eq('updated_at',input.expectedUpdatedAt).select('username'))
  if(!rows?.length)throw new ApiError(409,'Review settings changed. Read planner_schedule_read before retrying.')
  if(enabled&&current.execution==='agent')checked(await db().from('planner_agent_settings').update({schedule_enabled:false}).eq('username',username))
  return {...await readAutomationSettings(username),saved:true}
}
