import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
export const attemptFields='id,chat_id,prompt,status,detail,partial_reply,submitted_at,created_at,updated_at'
export async function subscriptionAttemptAction(username:string,input:Record<string,unknown>){
 const args=z.object({action:z.enum(['relay_attempt_start','relay_attempt_update']),chatId:z.string().uuid(),turnId:z.string().uuid()}).parse(input)
 const chat=storage(await db().from('planner_subscription_chats').select('id,archived,deleted_at').eq('username',username).eq('id',args.chatId).maybeSingle())
 if(!chat||chat.archived||chat.deleted_at)throw new ApiError(404,'Open an active owned chat first.')
 const rows=()=>db().from('planner_subscription_attempts').select(attemptFields).eq('username',username).eq('chat_id',args.chatId).eq('id',args.turnId)
 const prior=storage(await rows().maybeSingle())
 if(args.action==='relay_attempt_start'){
  const {prompt}=z.object({prompt:z.string().min(1).max(12000)}).parse(input)
  if(prior){if(prior.prompt!==prompt)throw new ApiError(409,'This request belongs to another message.');return prior}
  const created=await db().from('planner_subscription_attempts').insert({id:args.turnId,username,chat_id:args.chatId,prompt}).select(attemptFields).single()
  if(created.error?.code==='23505'){const saved=storage(await rows().maybeSingle());if(saved?.prompt===prompt)return saved;throw new ApiError(409,'This request belongs to another message.')}
  return storage(created)
 }
 if(!prior)throw new ApiError(404,'Request receipt not found.')
 const update=z.object({status:z.enum(['submitted','failed','interrupted']),detail:z.string().max(1000).default(''),partialReply:z.string().max(80000).default('')}).parse(input)
 if(!['started','submitted'].includes(prior.status))return prior
 const stamp=new Date().toISOString()
 const saved=storage(await db().from('planner_subscription_attempts').update({status:update.status,detail:update.detail,partial_reply:update.partialReply,updated_at:stamp,...(update.status==='submitted'&&!prior.submitted_at?{submitted_at:stamp}:{})}).eq('username',username).eq('chat_id',args.chatId).eq('id',args.turnId).in('status',['started','submitted']).select(attemptFields).maybeSingle())
 return saved||storage(await rows().single())
}
