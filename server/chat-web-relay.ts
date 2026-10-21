import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {uuid} from './vm-validation.js'

const fields='id,message,reply,status,error,created_at,finished_at'
// Separate experiment: never enqueue agent jobs or change agent settings.
export async function chatWebRelay(request:Request,username:string){
 if(username!=='arin')throw new ApiError(403,'This experiment is only enabled for its owner.')
 if(request.method==='GET'){
  const jobs=storage(await db().from('planner_chat_web_relay').select(fields).eq('username',username).order('created_at',{ascending:false}).limit(30))
  return json({jobs:jobs.reverse()})
 }
 if(request.method!=='POST')throw new ApiError(405,'Use GET or POST.')
 const input=await body(request)
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
 if(existing){if(existing.message!==message)throw new ApiError(409,'This message ID is already in use.');return json(existing)}
 const result=await db().from('planner_chat_web_relay').insert({id:input.id,username,message,status:'running'}).select(fields).single()
 if(result.error?.code==='23505')throw new ApiError(409,'Wait for the current experimental message to finish.')
 return json(storage(result),202)
}

export async function chatWebRelayWorker(request:Request,username:string,action:string):Promise<never>{
 void request;void username;void action
 throw new ApiError(410,'The Chat experiment now uses the device browser extension. VM forwarding is disabled.')
}
