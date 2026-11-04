import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {VM_SOURCES,type VmSource,type VmState} from '../src/lib/vm.js'
import {sourceAlerts} from '../src/lib/sourceAlerts.js'
export async function reportSourceHealth(username:string,source:string,key:string,error:string|null){
 if(!(source in VM_SOURCES)||!key||key.length>200)throw new ApiError(400,'Choose a valid source and connection.')
 storage(await db().rpc('planner_report_source_health',{p_username:username,p_source:source,p_connection_key:key,p_error:error?.slice(0,1000)||null}))
}
export async function withSourceHealth<T>(username:string,source:VmSource,key:string,run:()=>Promise<T>):Promise<T>{
 try{const result=await run();await reportSourceHealth(username,source,key,null).catch(()=>{});return result}
 catch(error){
  if(!(error instanceof ApiError)||error.status===401||error.status===403||error.status>=500)await reportSourceHealth(username,source,key,error instanceof ApiError?error.message:'Could not access this source. Verify the connection and try again.').catch(()=>{})
  throw error
 }
}
export async function sourceHealthStatus(username:string){
 const [{googleCalendarStatus},{fixedSyncStatus}]=await Promise.all([import('./agent.js'),import('./google-fixed-sync.js')])
 const [settings,health,google,sync]=await Promise.all([
  db().from('planner_vm_settings').select('sources,sites').eq('username',username).maybeSingle(),
  db().from('planner_source_health').select('source,connection_key,incident_id,error,first_detected_at').eq('username',username).not('error','is',null).order('first_detected_at').limit(100),
  googleCalendarStatus(username),fixedSyncStatus(username)
 ])
 const prefs=storage(settings)||{sources:[],sites:{}}
 return {issues:sourceAlerts(prefs as VmState['settings'],google,sync,storage(health)),checkedAt:new Date().toISOString()}
}
