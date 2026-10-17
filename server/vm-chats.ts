import { ApiError, db } from './cloud.js'
import { uuid } from './vm-validation.js'

export async function bulkManageChats(username:string,input:{ids?:unknown;action?:unknown}) {
  if(!Array.isArray(input.ids) || !input.ids.length || input.ids.length>100 || input.ids.some(id=>!uuid(id)))throw new ApiError(400,'Select between 1 and 100 valid chats.')
  if(!['archive','restore','delete','untrash','purge'].includes(String(input.action)))throw new ApiError(400,'Choose archive, restore, Bin or delete.')
  const ids=[...new Set(input.ids as string[])]
  const result=await db().rpc('planner_manage_chats',{p_username:username,p_ids:ids,p_action:input.action})
  if(result.error)throw new ApiError(result.error.code==='P0001'?409:503,result.error.code==='P0001'?result.error.message:'Could not update selected chats.')
  return result.data as {ok:boolean;ids:string[];count:number}
}
