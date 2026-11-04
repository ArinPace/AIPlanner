import {z} from 'zod'
import {db} from './cloud.js'
import {storage} from './mcp-auth.js'
const fields='week_scale_to_duration,month_scale_to_duration'
export async function calendarDisplaySettings(username:string,input?:unknown){
 if(input!==undefined){
  const patch=z.object({week:z.boolean().optional(),month:z.boolean().optional()}).strict().refine(x=>x.week!==undefined||x.month!==undefined).parse(input)
  storage(await db().from('planner_vm_settings').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
  storage(await db().from('planner_vm_settings').update({...('week'in patch?{week_scale_to_duration:patch.week}:{}),...('month'in patch?{month_scale_to_duration:patch.month}:{})}).eq('username',username))
 }
 const row=storage(await db().from('planner_vm_settings').select(fields).eq('username',username).maybeSingle())
 return {week:row?.week_scale_to_duration===true,month:row?.month_scale_to_duration===true}
}
