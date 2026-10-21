import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'

export const deviceChatFields='id,title,is_main,pinned,archived,deleted_at,chatgpt_url,created_at,updated_at'
export async function deviceMainChat(username:string){
 let chat=storage(await db().from('planner_device_chats').select(deviceChatFields).eq('username',username).eq('is_main',true).maybeSingle())
 if(!chat){
  const result=await db().from('planner_device_chats').insert({username,title:'Main Chat',is_main:true,pinned:true}).select(deviceChatFields).single()
  if(result.error?.code==='23505')chat=storage(await db().from('planner_device_chats').select(deviceChatFields).eq('username',username).eq('is_main',true).single())
  else chat=storage(result)
 }
 return chat
}
export async function deviceChat(username:string,id:string){
 const chat=storage(await db().from('planner_device_chats').select(deviceChatFields).eq('username',username).eq('id',id).maybeSingle())
 if(!chat)throw new ApiError(404,'Chat not found.')
 return chat
}
export async function changeDeviceChat(username:string,input:Record<string,unknown>){
 if(input.action==='chat-branch'){
  const args=z.object({chatId:z.string().uuid(),jobId:z.string().uuid(),message:z.string().trim().min(1).max(12000).optional()}).parse(input)
  const source=await deviceChat(username,args.chatId),job=storage(await db().from('planner_chat_web_relay').select('id,chat_id,created_at').eq('username',username).eq('id',args.jobId).maybeSingle())
  if(!job||!(job.chat_id===source.id||source.is_main&&job.chat_id===null))throw new ApiError(404,'Message not found in this chat.')
  const chat=storage(await db().from('planner_device_chats').insert({username,title:('Branch - '+source.title).slice(0,120)}).select(deviceChatFields).single())
  const history=storage(await db().from('planner_chat_web_relay').select('id,message,reply,created_at').eq('username',username).or(source.is_main?`chat_id.eq.${source.id},chat_id.is.null`:`chat_id.eq.${source.id}`).lte('created_at',job.created_at).order('created_at',{ascending:false}).limit(100)).reverse()
  const copied=history.filter(row=>args.message===undefined||row.id!==args.jobId).map(row=>({id:randomUUID(),username,chat_id:chat.id,message:row.message,reply:row.reply,status:'completed',created_at:row.created_at,finished_at:row.created_at}))
  if(copied.length)storage(await db().from('planner_chat_web_relay').insert(copied))
  return {chat,draft:args.message||'',copied:copied.length,contextLimit:100}
 }
 if(input.action==='chat-create'){
  const args=z.object({title:z.string().trim().min(1).max(120).default('New chat')}).parse(input)
  return storage(await db().from('planner_device_chats').insert({id:randomUUID(),username,title:args.title}).select(deviceChatFields).single())
 }
 const args=z.object({chatId:z.string().uuid(),title:z.string().trim().min(1).max(120).optional(),pinned:z.boolean().optional(),archived:z.boolean().optional(),deleted:z.boolean().optional(),url:z.string().max(2000).nullable().optional(),confirm:z.string().optional()}).parse(input)
 const chat=await deviceChat(username,args.chatId)
 if(input.action==='chat-reset'){
  if(args.confirm!=='RESET CHAT')throw new ApiError(400,'Confirm this chat reset first.')
  const active=storage(await db().from('planner_chat_web_relay').select('id').eq('username',username).in('status',['queued','running']).limit(1))
  if(active.length)throw new ApiError(409,'Stop the active message before resetting.')
  storage(await db().from('planner_chat_web_relay').delete().eq('username',username).or(chat.is_main?`chat_id.eq.${chat.id},chat_id.is.null`:`chat_id.eq.${chat.id}`))
  return storage(await db().from('planner_device_chats').update({chatgpt_url:null,updated_at:new Date().toISOString()}).eq('username',username).eq('id',chat.id).select(deviceChatFields).single())
 }
 if(chat.is_main&&(args.pinned===false||args.archived===true||args.deleted===true||args.title!==undefined))throw new ApiError(400,'Main Chat is permanently pinned and cannot be renamed, archived or binned.')
 if(args.url){const url=new URL(args.url);if(url.origin!=='https://chatgpt.com'||!/^\/g\/g-p-[^/]+\/(?:c\/[a-z0-9-]+|project)\/?$/i.test(url.pathname)||url.search||url.hash)throw new ApiError(400,'Use the actual Ai Planner project conversation URL.')}
 const patch={updated_at:new Date().toISOString(),...(args.title===undefined?{}:{title:args.title}),...(args.pinned===undefined?{}:{pinned:args.pinned}),...(args.archived===undefined?{}:{archived:args.archived}),...(args.deleted===undefined?{}:{deleted_at:args.deleted?new Date().toISOString():null}),...(args.url===undefined?{}:{chatgpt_url:args.url})}
 return storage(await db().from('planner_device_chats').update(patch).eq('username',username).eq('id',chat.id).select(deviceChatFields).single())
}
