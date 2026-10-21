import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {uuid} from './vm-validation.js'
import {changeDeviceChat,deviceChat,deviceChatFields,deviceMainChat} from './device-chats.js'
import {deviceChatContext,deviceToolCalls} from './device-chat-tools.js'
import {readPlanning} from './planning.js'

const fields='id,chat_id,message,reply,status,error,created_at,finished_at'
// Separate device transport: app tools are shared, but no Agent job is enqueued.
export async function chatWebRelay(request:Request,username:string){
 if(username!=='arin')throw new ApiError(403,'This experiment is only enabled for its owner.')
 if(request.method==='GET'){
  const main=await deviceMainChat(username),url=new URL(request.url),chatId=url.searchParams.get('chat')||main.id
  if(!uuid(chatId))throw new ApiError(400,'Choose a chat.')
  const chat=await deviceChat(username,chatId)
  let query=db().from('planner_chat_web_relay').select(fields).eq('username',username).or(chat.is_main?`chat_id.eq.${chatId},chat_id.is.null`:`chat_id.eq.${chatId}`)
  const before=url.searchParams.get('before');if(before){if(!Number.isFinite(Date.parse(before)))throw new ApiError(400,'Invalid history cursor.');query=query.lt('created_at',before)}
  const jobs=storage(await query.order('created_at',{ascending:false}).limit(21)),hasOlder=jobs.length>20
  return json({chat,jobs:jobs.slice(0,20).reverse(),hasOlder,chats:storage(await db().from('planner_device_chats').select(deviceChatFields).eq('username',username).order('pinned',{ascending:false}).order('updated_at',{ascending:false}))})
 }
 if(request.method!=='POST')throw new ApiError(405,'Use GET or POST.')
 const input=await body(request)
 if(['chat-create','chat-update','chat-reset','chat-branch'].includes(String(input.action)))return json(await changeDeviceChat(username,input))
 if(input.action==='context'){
  let history=''
  if(uuid(input.chatId)){
   const chat=await deviceChat(username,input.chatId)
   if(!chat.chatgpt_url){const rows=storage(await db().from('planner_chat_web_relay').select('message,reply').eq('username',username).or(chat.is_main?`chat_id.eq.${chat.id},chat_id.is.null`:`chat_id.eq.${chat.id}`).order('created_at',{ascending:false}).limit(100));history=rows.reverse().map(row=>'User: '+row.message+'\nAssistant: '+row.reply).join('\n\n').slice(-50000)}
  }
  return json({...await deviceChatContext(username),history})
 }
 if(input.action==='tools')return json(await deviceToolCalls(username,input))
 if(input.action==='activate'){
  const row=await readPlanning(username)
  if(!row.startedAt){const saved=storage(await db().from('planner_planning').update({started_at:new Date().toISOString(),state:{...row.profile,enabled:true},revision:row.revision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',row.revision).select('revision'));if(!saved.length)throw new ApiError(409,'Planning changed. Try Begin Planning again.')}
  return json({activated:true})
 }
 if(input.action==='followup'){
  const message=typeof input.message==='string'?input.message.trim():''
  if(!uuid(input.id)||!uuid(input.chatId)||!message||message.length>12000)throw new ApiError(400,'Invalid follow-up.')
  await deviceChat(username,input.chatId)
  const row=storage(await db().from('planner_chat_web_relay').upsert({id:input.id,username,chat_id:input.chatId,message,status:'completed',finished_at:new Date().toISOString()},{onConflict:'id',ignoreDuplicates:true}).select(fields))
  return json(row[0]||storage(await db().from('planner_chat_web_relay').select(fields).eq('username',username).eq('id',input.id).single()))
 }
 if(input.action==='finish'){
  if(!uuid(input.id))throw new ApiError(400,'Choose a message.')
  const rows=storage(await db().from('planner_chat_web_relay').update({reply:typeof input.reply==='string'?input.reply.slice(0,80000):'',status:input.error?'failed':'completed',error:typeof input.error==='string'?input.error.slice(0,1000):null,finished_at:new Date().toISOString()}).eq('username',username).eq('id',input.id).eq('status','running').is('lease',null).select(fields))
  if(!rows.length)throw new ApiError(409,'This device message has already finished or belongs to another transport.')
  return json(rows[0])
 }
 if(input.action!=='begin')throw new ApiError(400,'Connect the device browser extension before sending.')
 const message=typeof input.message==='string'?input.message.trim():''
 if(!uuid(input.id)||!message||message.length>12000)throw new ApiError(400,'Enter a message of up to 12,000 characters.')
 const existing=storage(await db().from('planner_chat_web_relay').select(fields).eq('username',username).eq('id',input.id).maybeSingle())
 if(existing){if(existing.message!==message||(input.chatId&&existing.chat_id!==input.chatId))throw new ApiError(409,'This message ID is already in use.');return json(existing)}
 const chatId=uuid(input.chatId)?input.chatId:(await deviceMainChat(username)).id,chat=await deviceChat(username,chatId)
 if(chat.deleted_at||chat.archived)throw new ApiError(409,'Restore this chat before sending.')
 const result=await db().from('planner_chat_web_relay').insert({id:input.id,username,chat_id:chatId,message,status:'running'}).select(fields).single()
 if(result.error?.code==='23505')throw new ApiError(409,'Wait for the current experimental message to finish.')
 return json(storage(result),202)
}

export async function chatWebRelayWorker(request:Request,username:string,action:string):Promise<never>{
 void request;void username;void action
 throw new ApiError(410,'The Chat experiment now uses the device browser extension. VM forwarding is disabled.')
}
