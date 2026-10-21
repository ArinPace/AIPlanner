import {randomUUID} from 'node:crypto'
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
 const input=await body(request),message=typeof input.message==='string'?input.message.trim():''
 if(!uuid(input.id)||!message||message.length>12000)throw new ApiError(400,'Enter a message of up to 12,000 characters.')
 const existing=storage(await db().from('planner_chat_web_relay').select(fields).eq('username',username).eq('id',input.id).maybeSingle())
 if(existing){if(existing.message!==message)throw new ApiError(409,'This message ID is already in use.');return json(existing)}
 const result=await db().from('planner_chat_web_relay').insert({id:input.id,username,message}).select(fields).single()
 if(result.error?.code==='23505')throw new ApiError(409,'Wait for the current experimental message to finish.')
 return json(storage(result),202)
}

export async function chatWebRelayWorker(request:Request,username:string,action:string){
 if(username!=='arin')throw new ApiError(403,'This experiment is only enabled for its owner.')
 const input=await body(request)
 if(action==='claim'){
  // A lost browser outcome is never automatically resent.
  storage(await db().from('planner_chat_web_relay').update({status:'failed',error:'The relay stopped responding. Check the ChatGPT conversation before resending.',finished_at:new Date().toISOString()}).eq('username',username).eq('status','running').lt('lease_until',new Date().toISOString()))
  const next=storage(await db().from('planner_chat_web_relay').select('id').eq('username',username).eq('status','queued').order('created_at').limit(1))
  if(!next.length)return json({job:null})
  const lease=randomUUID()
  const rows=storage(await db().from('planner_chat_web_relay').update({status:'running',lease,lease_until:new Date(Date.now()+120000).toISOString()}).eq('username',username).eq('id',next[0].id).eq('status','queued').select('id,message,lease'))
  return json({job:rows[0]||null})
 }
 if(!uuid(input.id)||!uuid(input.lease))throw new ApiError(400,'Invalid relay lease.')
 const patch=action==='progress'?{reply:typeof input.reply==='string'?input.reply.slice(0,80000):'',lease_until:new Date(Date.now()+120000).toISOString()}:
  action==='finish'?{reply:typeof input.reply==='string'?input.reply.slice(0,80000):'',status:input.error?'failed':'completed',error:typeof input.error==='string'?input.error.slice(0,1000):null,finished_at:new Date().toISOString()}:null
 if(!patch)throw new ApiError(404,'Unknown relay operation.')
 const rows=storage(await db().from('planner_chat_web_relay').update(patch).eq('username',username).eq('id',input.id).eq('lease',input.lease).eq('status','running').gt('lease_until',new Date().toISOString()).select('id'))
 if(!rows.length)throw new ApiError(409,'The relay lease expired. Check ChatGPT before resending.')
 return json({ok:true})
}
