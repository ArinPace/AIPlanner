import {z} from 'zod'
import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {googleCalendarStatus} from './agent.js'
const fields='id,title,is_main,pinned,archived,deleted_at,created_at,updated_at'
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
  const main=await mainChat(username),id=url.searchParams.get('chat')||main.id
  z.string().uuid().parse(id);const chat=await owned(username,id)
  const before=url.searchParams.get('before')
  let query=db().from('planner_subscription_messages').select('id,role,content,created_at').eq('username',username).eq('chat_id',id)
  if(before){z.string().uuid().parse(before);const cursor=storage(await db().from('planner_subscription_messages').select('id,created_at').eq('username',username).eq('chat_id',id).eq('id',before).maybeSingle());if(!cursor)throw new ApiError(404,'Message cursor not found.');query=query.or('created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')')}
  const [chats,messages,prefs,google]=await Promise.all([
   db().from('planner_subscription_chats').select(fields).eq('username',username).or('deleted_at.is.null,deleted_at.gt.'+new Date(Date.now()-30*86400000).toISOString()).order('is_main',{ascending:false}).order('pinned',{ascending:false}).order('updated_at',{ascending:false}).limit(200),
   query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(21),
   db().from('planner_vm_settings').select('sources').eq('username',username).maybeSingle(),googleCalendarStatus(username)
  ])
  const rows=storage(messages)
  return json({chat,chats:storage(chats),messages:rows.slice(0,20).reverse(),hasOlder:rows.length>20,sources:storage(prefs)?.sources||[],google,connection:{provider:'chatgpt-subscription',connected:false,state:'setup_required',message:'ChatGPT subscription sign-in is not configured yet.'}})
 }
 if(request.method!=='POST')throw new ApiError(405,'Use GET or POST.')
 const input=await body(request)
 // Never fall back to API-key billing, the Agent VM, or a browser extension.
 if(input.action==='send'||input.action==='connect')throw new ApiError(409,'ChatGPT subscription sign-in is not configured yet. Hosted access requires an approved Sign in with ChatGPT integration. Your draft has been kept.')
 if(input.action==='relay_save'){
  const args=z.object({chatId:z.string().uuid(),turnId:z.string().uuid(),prompt:z.string().min(1).max(12000),reply:z.string().min(1).max(80000)}).parse(input)
  const chat=await owned(username,args.chatId)
  if(chat.archived||chat.deleted_at)throw new ApiError(409,'Restore this chat before saving its reply.')
  const saved=storage(await db().rpc('planner_save_relay_turn',{p_username:username,p_chat:args.chatId,p_turn:args.turnId,p_prompt:args.prompt,p_reply:args.reply}))
  if(saved!==true)throw new ApiError(409,'This chat changed. Restore it before saving its reply.')
  return json({ok:true})
 }
 if(input.action==='create'){
  const args=z.object({title:z.string().trim().min(1).max(120).default('New chat')}).parse(input)
  return json(storage(await db().from('planner_subscription_chats').insert({username,title:args.title}).select(fields).single()))
 }
 if(input.action!=='update')throw new ApiError(400,'Choose a supported chat action.')
 const args=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(120).optional(),pinned:z.boolean().optional(),archived:z.boolean().optional(),deleted:z.boolean().optional()}).parse(input)
 const chat=await owned(username,args.id)
 if(chat.is_main)throw new ApiError(400,'Main Chat stays pinned and cannot be renamed, archived or moved to Bin.')
 const patch={updated_at:new Date().toISOString(),...(args.title===undefined?{}:{title:args.title}),...(args.pinned===undefined?{}:{pinned:args.pinned}),...(args.archived===undefined?{}:{archived:args.archived}),...(args.deleted===undefined?{}:{deleted_at:args.deleted?new Date().toISOString():null})}
 return json(storage(await db().from('planner_subscription_chats').update(patch).eq('username',username).eq('id',chat.id).select(fields).single()))
}
