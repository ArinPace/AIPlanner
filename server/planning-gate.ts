import {ApiError,db} from './cloud.js'
export async function requireCalendarStarted(username:string){
 const {data,error}=await db().from('planner_planning').select('started_at').eq('username',username).maybeSingle()
 if(error)throw new ApiError(503,'Could not check planning setup.')
 if(!data?.started_at)throw new ApiError(409,'Calendar changes are paused during setup. The user must click Start planning my calendar in Main Chat. Continue discussing Goals and To do and saving setup preferences without changing calendar events.')
}
