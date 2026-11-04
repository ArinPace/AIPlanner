import {z} from 'zod'
import {db,ApiError} from './cloud.js'
import {storage} from './mcp-auth.js'
import {normalizeTaskNotifications} from '../src/lib/taskNotifications.js'
const schema=z.object({enabled:z.boolean(),switches:z.boolean(),advance:z.boolean(),longTaskMinutes:z.number().int().min(1).max(1440),minutes:z.array(z.number().int().min(1).max(1440)).min(1).max(10)})
export async function taskNotificationSettings(username:string,input?:unknown){
 if(input!==undefined){
  const settings=normalizeTaskNotifications(schema.parse(input))
  storage(await db().from('planner_vm_settings').upsert({username,task_notifications:settings},{onConflict:'username'}))
  return settings
 }
 const row=storage(await db().from('planner_vm_settings').select('task_notifications').eq('username',username).maybeSingle())
 if(row?.task_notifications&&typeof row.task_notifications!=='object')throw new ApiError(503,'Notification settings could not be read.')
 return normalizeTaskNotifications(row?.task_notifications||{})
}
