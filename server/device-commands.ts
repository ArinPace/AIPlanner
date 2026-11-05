import {z} from 'zod'
import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {clientControlSchema} from '../src/lib/clientControlSchema.js'
import {validateDeviceControl} from './client-control-tools.js'
const fields='id,command,status,result,created_at,expires_at'
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)
export async function submitDeviceCommand(username:string,input:unknown){
 const args=z.object({requestKey:z.string().min(1).max(120),command:clientControlSchema}).parse(input)
 await validateDeviceControl(username,args.command)
 const find=()=>db().from('planner_device_commands').select(fields).eq('username',username).eq('request_key',args.requestKey).maybeSingle()
 let row=storage(await find())
 if(row&&canonical(row.command)!==canonical(args.command))throw new ApiError(409,'This device request key belongs to different arguments.')
 if(!row){const saved=await db().from('planner_device_commands').insert({username,request_key:args.requestKey,command:args.command}).select(fields).single();row=saved.error?.code==='23505'?storage(await find()):storage(saved);if(!row||canonical(row.command)!==canonical(args.command))throw new ApiError(409,'Device request already exists with different arguments.')}
 return {id:row.id,status:row.status,executed:row.status==='completed',expiresAt:row.expires_at,message:'Read this command for device acknowledgement. Planner must be open on the iPhone.'}
}
export async function readDeviceCommand(username:string,id:string){
 const row=storage(await db().from('planner_device_commands').select(fields).eq('username',username).eq('id',id).maybeSingle())
 if(!row)throw new ApiError(404,'Device command not found.')
 return {...row,status:['queued','running'].includes(row.status)&&Date.parse(row.expires_at)<=Date.now()?'expired':row.status,executed:row.status==='completed'}
}
export async function cancelDeviceCommand(username:string,id:string){
 const rows=storage(await db().from('planner_device_commands').update({status:'cancelled'}).eq('username',username).eq('id',id).eq('status','queued').select('id'))
 return {cancelled:(rows?.length||0)>0,...await readDeviceCommand(username,id)}
}
export async function handleDeviceCommands(request:Request,username:string){
 if(request.method!=='POST')throw new ApiError(405,'Use POST.')
 const input=await body(request)
 if(input.action==='claim'){
  const row=storage(await db().from('planner_device_commands').select(fields).eq('username',username).eq('status','queued').gt('expires_at',new Date().toISOString()).order('created_at').limit(1).maybeSingle())
  if(!row)return json({command:null})
  const claimed=storage(await db().from('planner_device_commands').update({status:'running'}).eq('username',username).eq('id',row.id).eq('status','queued').select(fields).maybeSingle())
  return json({command:claimed})
 }
 const args=z.object({action:z.literal('finish'),id:z.string().uuid(),result:z.unknown(),ok:z.boolean()}).parse(input)
 if(JSON.stringify(args.result).length>100000)throw new ApiError(400,'Device result is too large.')
 const rows=storage(await db().from('planner_device_commands').update({status:args.ok?'completed':'failed',result:args.result}).eq('username',username).eq('id',args.id).eq('status','running').select('id'))
 if(!rows?.length)throw new ApiError(409,'Device command changed or belongs to another account. Read before retrying.')
 return json({saved:true})
}
