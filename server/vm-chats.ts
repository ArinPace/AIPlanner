import { ApiError, db } from './cloud.js'
import { storage } from './mcp-auth.js'
import { uuid } from './vm-validation.js'

export async function bulkManageChats(username:string,input:{ids?:unknown;action?:unknown}) {
  if(!Array.isArray(input.ids) || !input.ids.length || input.ids.length>100 || input.ids.some(id=>!uuid(id)))throw new ApiError(400,'Select between 1 and 100 valid chats.')
  if(!['archive','restore','delete'].includes(String(input.action)))throw new ApiError(400,'Choose archive, restore or delete.')
  const ids=[...new Set(input.ids as string[])]
  const owned=storage(await db().from('planner_vm_chats').select('id').eq('username',username).in('id',ids))
  if(owned.length!==ids.length)throw new ApiError(404,'Some selected chats are unavailable. Refresh the list before trying again.')
  // One owner-scoped mutation, so a failed request cannot partially update the selection.
  const query=input.action==='delete' ? db().from('planner_vm_chats').delete() : db().from('planner_vm_chats').update({archived:input.action==='archive'})
  const changed=storage(await query.eq('username',username).in('id',ids).select('id'))
  return {ok:true,ids:changed.map(row=>row.id),count:changed.length}
}
