import {AGENT_FILE_POLICY} from './agent-file-policy.js'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {callSchema,relayProtocol,runPlannerRelayTools} from './device-chat-tools.js'
import {readAgentInstructions} from './agent-instructions.js'
import {automationRow} from './automation.js'
const uuid=z.string().uuid()
export async function subscriptionTools(username:string,input:Record<string,unknown>){
 const args=z.object({action:z.string(),chatId:uuid,turnId:uuid.optional()}).parse(input)
 const chat=storage(await db().from('planner_subscription_chats').select('id,archived,deleted_at,tutor_subject_id,title').eq('username',username).eq('id',args.chatId).maybeSingle())
 if(!chat||chat.archived||chat.deleted_at)throw new ApiError(404,'Open an active owned Chat conversation first.')
 if(args.action==='tool_activate'){
  const row=await (await import('./planning.js')).readPlanning(username)
  if(!row.startedAt){const saved=storage(await db().from('planner_planning').update({started_at:new Date().toISOString(),state:{...row.profile,enabled:true},revision:row.revision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',row.revision).select('revision'));if(!saved.length)throw new ApiError(409,'Planning changed. Try Begin Planning again.')}
  return {activated:true}
 }
 const turns=()=>db().from('planner_subscription_tool_turns').select('*').eq('username',username).eq('chat_id',args.chatId)
 if(args.action==='tool_cancel_active'){
  storage(await db().from('planner_subscription_tool_turns').update({status:'cancelled'}).eq('username',username).eq('chat_id',args.chatId).eq('status','running'))
  return {cancelled:true,message:'Future tool execution stopped. Earlier actions may have completed; read current app state.'}
 }
 if(!args.turnId)throw new ApiError(400,'Choose the current request.')
 const turnId=args.turnId
 if(args.action==='tool_begin'){
  const {prompt}=z.object({prompt:z.string().min(1).max(30000)}).parse(input)
  const digest=createHash('sha256').update(prompt).digest('hex')
  storage(await db().from('planner_subscription_tool_turns').update({status:'cancelled'}).eq('username',username).eq('chat_id',args.chatId).eq('status','running').lt('expires_at',new Date().toISOString()))
  const prior=storage(await turns().eq('id',turnId).maybeSingle())
  if(prior&&(prior.prompt_digest!==digest||prior.status!=='running'))throw new ApiError(409,'This turn already belongs to another or finished request.')
  if(!prior){const created=await db().from('planner_subscription_tool_turns').insert({id:turnId,username,chat_id:args.chatId,prompt_digest:digest});if(created.error)throw new ApiError(created.error.code==='23505'?409:503,created.error.code==='23505'?'A previous Planner tool turn is active. Review ChatGPT, then stop the unfinished request before sending again.':'Could not prepare app tools; no action was run.')}
  const [personal,automation]=await Promise.all([readAgentInstructions(username),automationRow(username)])
  return {turnId,instructions:AGENT_FILE_POLICY+'\n\n'+relayProtocol.replace('exactly one fenced planner-tools block with JSON','exactly one plain-text block starting with PLANNER_TOOL_REQUEST and ending with END_PLANNER_TOOL_REQUEST, containing JSON').replace('Do not produce a planner-tools block merely as an example.','Do not produce request markers as examples. Keep markers as plain text around the JSON code block.')+'\n\nThis is the iPhone/native Planner Chat relay. Keep tool blocks private; the relay executes them and returns results. Use your ChatGPT Work cloud browser for Brightspace and other websites; ask for secure sign-in when needed. Never put credentials in tool blocks. Browser approvals and secure forms are exposed inside Planner’s Connect website sheet. Let the user enter credentials there and approve Duo privately; never ask them to paste a password into chat. Do not claim you logged in or read a site unless you actually did.\n\nCurrent account instructions (revision '+personal.revision+'):\n'+personal.content+'\n\nExisting Agent review schedule, CONTEXT ONLY. Do not execute a scheduled review unless the user requests one:\n'+JSON.stringify(automation?.schedule||{})+(chat.tutor_subject_id?'\n\nYou are this subject’s Tutor: '+chat.title+' (folder '+chat.tutor_subject_id+'). Maintain this subject folder with verified current homework/solutions, quizzes/solutions, lectures/slides/recordings/recitations, tests/solutions and a grade/progress tracking note. Preserve IDs and manual writing. Report inaccessible/unpublished materials; do not invent them.':'\n\nMain Chat reads subject folders for context; subject Tutors own their maintenance.')+'\n\nCurrent user request follows below. Begin with relay_list_tools and relay_describe_tools when you need app tools. You may call the full listed Planner and authorized Google tools; all are scoped to this signed-in Planner account.'}
 }
 const authorize=async()=>{const row=storage(await turns().eq('id',turnId).maybeSingle());if(!row||row.status!=='running'||Date.parse(row.expires_at)<=Date.now())throw new ApiError(409,'This Planner tool turn is no longer active. No further tools were run.')}
 if(args.action==='tool_finish'){
  const {cancelled}=z.object({cancelled:z.boolean().optional()}).parse(input)
  storage(await db().from('planner_subscription_tool_turns').update({status:cancelled?'cancelled':'completed'}).eq('username',username).eq('chat_id',args.chatId).eq('id',turnId).eq('status','running'))
  return {finished:true}
 }
 if(args.action!=='tool_call')throw new ApiError(400,'Unknown tool action.')
 await authorize()
 const {calls}=z.object({calls:z.array(callSchema).min(1).max(8)}).parse(input)
 return runPlannerRelayTools(username,calls,{table:'planner_subscription_tool_calls',key:'turn_id',value:turnId},authorize)
}
