import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {DEFAULT_VM_SCHEDULE,validateSchedule,scheduleSlot,scheduledReviewMessage} from './vm-power.js'
export async function subscriptionScheduleSettings(username:string){
 const row=storage(await db().from('planner_vm_settings').select('agent_hidden,schedule_enabled,subscription_schedule_enabled,subscription_schedule,schedule,updated_at').eq('username',username).maybeSingle())
 return {agentHidden:row?.agent_hidden===true,agentScheduleEnabled:row?.schedule_enabled===true,enabled:row?.subscription_schedule_enabled===true,schedule:row?.subscription_schedule||row?.schedule||DEFAULT_VM_SCHEDULE,updatedAt:row?.updated_at||null,execution:'foreground',message:'Keep Planner open on Main Chat with ChatGPT signed in. Reviews cannot run while the app is closed.'}
}
export async function subscriptionScheduleAction(username:string,input:Record<string,unknown>){
 if(input.action==='schedule_prepare_cloud'){
  const prefs=await subscriptionScheduleSettings(username)
  return {enabled:false,prompt:'Set up subscription-based CLOUD scheduled reviews for Planner account '+username+'. Do not run a review now. First verify that this ChatGPT chat has Planner connected directly as an authenticated MCP app at https://aiplanner-ten.vercel.app/api/mcp for '+username+'. Read this account through the real connected tool. Plain PLANNER_TOOL_REQUEST relay blocks cannot execute while Planner is closed, so do not rely on them for scheduled runs. If the direct connector or the native ChatGPT cloud scheduler is unavailable, stop and tell me the exact setup step; do not claim a schedule was created. Once direct access is verified, use ChatGPT’s own scheduling capability for '+prefs.schedule.times.join(', ')+' America/New_York daily, keeping all chats in the Test project. Report actual task IDs, timezone, next run and enabled state; never fabricate these. Use the same Planner write permissions in prompted and scheduled runs. Cloud NextDNS tools work without my phone open once connected; native device commands require device acknowledgement. Save the following payload as the FUTURE task instructions only; do not execute it during setup. BEGIN FUTURE REVIEW PAYLOAD:\n\n'+scheduledReviewMessage(prefs.schedule)}
 }
 if(input.action==='schedule_read')return subscriptionScheduleSettings(username)
 if(input.action==='schedule_update'){
  const args=z.object({expectedUpdatedAt:z.string().nullable(),enabled:z.boolean(),signInsReady:z.literal(true).optional(),schedule:z.unknown().optional()}).parse(input)
  const current=await subscriptionScheduleSettings(username)
  if(current.updatedAt!==args.expectedUpdatedAt)throw new ApiError(409,'Schedule settings changed. Refresh before saving.')
  if(args.enabled&&current.agentScheduleEnabled)throw new ApiError(409,'Agent scheduled reviews are still active. Keep Chat reviews paused until you choose to move them; your Agent schedule was not changed.')
  if(args.enabled&&args.signInsReady!==true)throw new ApiError(400,'Finish your sign-ins and explicitly confirm readiness before enabling Chat reviews.')
  const schedule=validateSchedule(args.schedule||current.schedule)
  storage(await db().from('planner_vm_settings').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
  let update=db().from('planner_vm_settings').update({subscription_schedule_enabled:args.enabled,subscription_schedule:schedule,updated_at:new Date().toISOString()}).eq('username',username)
  if(current.updatedAt)update=update.eq('updated_at',current.updatedAt)
  if(!storage(await update.select('username')).length)throw new ApiError(409,'Schedule changed. Refresh before saving.')
  return subscriptionScheduleSettings(username)
 }
 if(input.action==='schedule_claim'){
  const args=z.object({chatId:z.string().uuid(),ready:z.literal(true)}).parse(input)
  const chat=storage(await db().from('planner_subscription_chats').select('is_main,archived,deleted_at').eq('username',username).eq('id',args.chatId).maybeSingle())
  if(!chat?.is_main||chat.archived||chat.deleted_at)throw new ApiError(409,'Open active Main Chat for scheduled reviews.')
  const prefs=await subscriptionScheduleSettings(username)
  if(!prefs.enabled)return {due:false}
  const slot=scheduleSlot(new Date(),validateSchedule(prefs.schedule),false)
  if(!slot)return {due:false}
  const inserted=await db().from('planner_subscription_reviews').insert({username,slot}).select('id').single()
  if(inserted.error?.code==='23505')return {due:false}
  const run=storage(inserted)
  return {due:true,runId:run.id,prompt:scheduledReviewMessage(prefs.schedule),label:'Scheduled planner review'}
 }
 if(input.action==='schedule_finish'){
  const args=z.object({runId:z.string().uuid(),completed:z.boolean()}).parse(input)
  storage(await db().from('planner_subscription_reviews').update({status:args.completed?'completed':'failed',finished_at:new Date().toISOString()}).eq('username',username).eq('id',args.runId).eq('status','claimed'))
  return {saved:true}
 }
 throw new ApiError(400,'Unknown Chat schedule action.')
}
