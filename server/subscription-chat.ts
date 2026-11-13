import {planChatMirror,type ChatMirror} from '../src/lib/chatSync.js'
import {z} from 'zod'
import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {googleCalendarStatus} from './agent.js'
const fields='tutor_subject_id,tutor_retired,id,provider_url,provider_snapshot,title,is_main,pinned,archived,deleted_at,created_at,updated_at'
async function owned(username:string,id:string){const chat=storage(await db().from('planner_subscription_chats').select(fields).eq('username',username).eq('id',id).maybeSingle());if(!chat)throw new ApiError(404,'Chat not found.');return chat}
async function mainChat(username:string){
 const find=()=>db().from('planner_subscription_chats').select(fields).eq('username',username).eq('is_main',true).maybeSingle()
 const existing=storage(await find());if(existing)return existing
 const created=await db().from('planner_subscription_chats').insert({username,title:'Main Chat',is_main:true,pinned:true}).select(fields).single()
 return created.error?.code==='23505'?storage(await find()):storage(created)
}
export async function handleSubscriptionChat(request:Request,username:string){
 const url=new URL(request.url)
 if(request.method==='GET'){
  const fast=url.searchParams.get('fast')==='1'
  // Chat is one persistent Main conversation; Agent retains its separate Tutor chats.
  const main=await mainChat(username)
  const id=main.id

  z.string().uuid().parse(id);const chat=await owned(username,id)
  const before=url.searchParams.get('before')
  let query=db().from('planner_subscription_messages').select('id,role,content,created_at').eq('username',username).eq('chat_id',id)
  if(before){z.string().uuid().parse(before);const cursor=storage(await db().from('planner_subscription_messages').select('id,created_at').eq('username',username).eq('chat_id',id).eq('id',before).maybeSingle());if(!cursor)throw new ApiError(404,'Message cursor not found.');query=query.or('created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')')}
  const pageSize=before?20:8
  const [chats,messages,prefs,google]=await Promise.all([
   db().from('planner_subscription_chats').select(fields).eq('username',username).or('deleted_at.is.null,deleted_at.gt.'+new Date(Date.now()-30*86400000).toISOString()).order('is_main',{ascending:false}).order('pinned',{ascending:false}).order('updated_at',{ascending:false}).limit(200),
   query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(pageSize+1),
   fast?Promise.resolve({data:{sources:[]},error:null}):db().from('planner_vm_settings').select('sources').eq('username',username).maybeSingle(),fast?Promise.resolve(undefined):googleCalendarStatus(username)
  ])
  const rows=storage(messages)
  return json({chat,chats:storage(chats).filter(row=>row.is_main),messages:rows.slice(0,pageSize).reverse(),hasOlder:rows.length>pageSize,sources:storage(prefs)?.sources||[],google,connection:{provider:'chatgpt-subscription',connected:false,state:'setup_required',message:'ChatGPT subscription sign-in is not configured yet.'}})
 }
 if(request.method!=='POST')throw new ApiError(405,'Use GET or POST.')
 const input=await body(request)
 if(typeof input.action==='string'&&input.action.startsWith('schedule_'))return json(await (await import('./subscription-schedule.js')).subscriptionScheduleAction(username,input))
 if(input.action==='tutor_sync')throw new ApiError(409,'Chat uses Main Chat only. Tutor conversations remain available in Agent.')
 if(typeof input.action==='string'&&input.action.startsWith('tool_'))return json(await (await import('./subscription-tools.js')).subscriptionTools(username,input))
 if(typeof input.action==='string'&&['file_start','file_finish','file_download'].includes(input.action))return await (await import('./subscription-files.js')).subscriptionFileAction(username,input)
 // Never fall back to API-key billing, the Agent VM, or a browser extension.
 if(input.action==='send'||input.action==='connect')throw new ApiError(409,'ChatGPT subscription sign-in is not configured yet. Hosted access requires an approved Sign in with ChatGPT integration. Your draft has been kept.')
 if(input.action==='relay_bind'){
  const args=z.object({chatId:z.string().uuid(),url:z.string().regex(/^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]+$/)}).parse(input)
  const chat=await owned(username,args.chatId)
  if(chat.provider_url===args.url)return json({ok:true})
  if(chat.provider_url)throw new ApiError(409,'This chat is already linked to another ChatGPT conversation. Refresh before syncing.')
  const saved=storage(await db().from('planner_subscription_chats').update({provider_url:args.url}).eq('username',username).eq('id',args.chatId).is('provider_url',null).select('id').maybeSingle())
  if(!saved)throw new ApiError(409,'This chat was linked while syncing. Refresh before trying again.')
  return json({ok:true})
 }
 if(input.action==='relay_mirror'){
  const mirror=z.object({title:z.string().trim().min(1).max(120),archived:z.boolean(),deleted:z.boolean()})
  const args=z.object({chatId:z.string().uuid(),expectedUpdatedAt:z.string(),url:z.string(),observed:mirror,applied:mirror.optional(),prefer:z.enum(['planner','chatgpt']).optional()}).parse(input)
  const chat=await owned(username,args.chatId)
  if(!chat.provider_url||args.url!==chat.provider_url)throw new ApiError(409,'This conversation link changed. Refresh before syncing.')
  if(chat.updated_at!==args.expectedUpdatedAt)throw new ApiError(409,'This chat changed. Refresh before syncing.')
  const local:ChatMirror={title:chat.title,archived:chat.archived,deleted:Boolean(chat.deleted_at)}
  const plan=planChatMirror(local,args.observed,chat.provider_snapshot||null,args.prefer)
  if(!args.applied)return json({plan,local,observed:args.observed})
  if(plan.conflicts.length)throw new ApiError(409,'Chat sync conflict: '+plan.conflicts.join(', ')+'. Choose which version to keep.')
  const expected={...args.observed,...plan.push}
  if(['title','archived','deleted'].some(k=>expected[k as keyof ChatMirror]!==args.applied![k as keyof ChatMirror]))throw new ApiError(409,'ChatGPT changes were not verified. Refresh before syncing.')
  const patch={title:args.applied.title,archived:args.applied.archived,deleted_at:args.applied.deleted?(chat.deleted_at||new Date().toISOString()):null,provider_snapshot:args.applied,updated_at:new Date().toISOString()}
  const saved=storage(await db().from('planner_subscription_chats').update(patch).eq('username',username).eq('id',chat.id).eq('updated_at',args.expectedUpdatedAt).select(fields).maybeSingle())
  if(!saved)throw new ApiError(409,'This chat changed while syncing. Refresh and retry.')
  return json(saved)
 }
 if(input.action==='relay_save'){
  const args=z.object({chatId:z.string().uuid(),turnId:z.string().uuid(),prompt:z.string().min(1).max(12000),reply:z.string().min(1).max(80000)}).parse(input)
  const chat=await owned(username,args.chatId)
  if(chat.archived||chat.deleted_at)throw new ApiError(409,'Restore this chat before saving its reply.')
  const saved=storage(await db().rpc('planner_save_relay_turn',{p_username:username,p_chat:args.chatId,p_turn:args.turnId,p_prompt:args.prompt,p_reply:args.reply}))
  if(saved!==true)throw new ApiError(409,'This chat changed. Restore it before saving its reply.')
  return json({ok:true})
 }
 if(input.action==='create')throw new ApiError(409,'Use the persistent Main Chat. Additional conversations are available in Agent.')
 if(input.action!=='update')throw new ApiError(400,'Choose a supported chat action.')
 const args=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(120).optional(),pinned:z.boolean().optional(),archived:z.boolean().optional(),deleted:z.boolean().optional()}).parse(input)
 const chat=await owned(username,args.id)
 if(chat.is_main&&args.pinned===false)throw new ApiError(400,'Main Chat stays pinned.')
 const patch={updated_at:new Date().toISOString(),...(args.title===undefined?{}:{title:args.title}),...(args.pinned===undefined?{}:{pinned:args.pinned}),...(args.archived===undefined?{}:{archived:args.archived}),...(args.deleted===undefined?{}:{deleted_at:args.deleted?new Date().toISOString():null}),...(!args.deleted&&args.deleted!==undefined&&chat.provider_snapshot?.deleted?{provider_url:null,provider_snapshot:null}:{})}
 return json(storage(await db().from('planner_subscription_chats').update(patch).eq('username',username).eq('id',chat.id).select(fields).single()))
}
