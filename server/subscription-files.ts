import {randomUUID,createHash} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
const bucket='planner-chat-files'
export async function subscriptionFileAction(username:string,input:Record<string,unknown>){
 if(input.action==='file_start'){
  const args=z.object({chatId:z.string().uuid(),name:z.string().trim().min(1).max(240),mime:z.string().max(150),size:z.number().int().positive().max(25*1024*1024)}).parse(input)
  const chat=storage(await db().from('planner_subscription_chats').select('id,archived,deleted_at').eq('username',username).eq('id',args.chatId).maybeSingle())
  if(!chat||chat.deleted_at||chat.archived)throw new ApiError(404,'Open an active owned chat first.')
  const id=randomUUID(),path=createHash('sha256').update(username).digest('hex')+'/'+id
  storage(await db().from('planner_subscription_files').insert({id,username,chat_id:args.chatId,name:args.name.replace(/[\r\n/\\]/g,'_'),mime:args.mime||'application/octet-stream',size:args.size,storage_path:path,status:'pending'}))
  const signed=await db().storage.from(bucket).createSignedUploadUrl(path,{upsert:false})
  if(signed.error)throw new ApiError(502,'Could not prepare this file upload.')
  return json({id,url:signed.data.signedUrl})
 }
 const {id}=z.object({id:z.string().uuid()}).parse(input)
 const row=storage(await db().from('planner_subscription_files').select('*').eq('username',username).eq('id',id).maybeSingle())
 if(!row)throw new ApiError(404,'File not found.')
 if(input.action==='file_finish'){
  if(row.status==='complete')return json({id,name:row.name,mime:row.mime,size:row.size})
  const info=await db().storage.from(bucket).info(row.storage_path)
  if(info.error)throw new ApiError(409,'This file has not finished uploading.')
  const actual=Number(info.data.size??info.data.metadata?.size)
  if(actual!==row.size)throw new ApiError(422,'Uploaded file size does not match. No transfer is confirmed.')
  storage(await db().from('planner_subscription_files').update({status:'complete'}).eq('id',id).eq('username',username))
  return json({id,name:row.name,mime:row.mime,size:row.size})
 }
 if(input.action==='file_download'){
  if(row.status!=='complete')throw new ApiError(409,'File is not ready.')
  const signed=await db().storage.from(bucket).createSignedUrl(row.storage_path,60,{download:row.name})
  if(signed.error)throw new ApiError(502,'Could not prepare this download.')
  return json({url:signed.data.signedUrl,name:row.name})
 }
 throw new ApiError(400,'Unsupported file action.')
}
export async function assertRelayFileReferences(username:string,attachments:{chatFileId?:string;size?:number;mime?:string}[]){
 if(!attachments.length)return
 const owned=storage(await db().from('planner_subscription_files').select('id,size,status,mime').eq('username',username).in('id',[...new Set(attachments.map(item=>item.chatFileId!))]))
 if(attachments.some(item=>!owned.some(file=>file.id===item.chatFileId&&file.status==='complete'&&file.size===item.size&&file.mime===item.mime)))throw new ApiError(400,'An attachment is not available in this account.')
}
