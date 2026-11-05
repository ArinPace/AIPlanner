import {z} from 'zod'
import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {sealVmCredential,openVmCredential} from './vm-vault.js'
export const dnsDomain=z.string().toLowerCase().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
async function account(username:string){const row=storage(await db().from('planner_cloud_dns').select('profile,credentials,updated_at').eq('username',username).maybeSingle());if(!row)throw new ApiError(409,'Connect cloud NextDNS in Screen Time first. The agent never needs your API key in chat.');return {...row,apiKey:openVmCredential(row.credentials).apiKey}}
async function provider(profile:string,apiKey:string,suffix:string,method='GET',data?:unknown){
 const response=await fetch('https://api.nextdns.io/profiles/'+profile+suffix,{method,headers:{'X-Api-Key':apiKey,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)})
 const value=await response.json().catch(()=>({})) as any
 if(!response.ok||value.errors)throw new ApiError(response.status===401||response.status===403?401:502,'NextDNS could not complete this request. Check the cloud connection; read the current rules before retrying a change.')
 return value
}
export async function cloudDNSStatus(username:string){const row=storage(await db().from('planner_cloud_dns').select('profile,updated_at').eq('username',username).maybeSingle());return {connected:Boolean(row),profile:row?.profile||null,updatedAt:row?.updated_at||null,execution:'cloud',deviceRoutingVerified:false,limits:'Domain rules affect devices using this DNS profile. They do not prevent offline app use. Installing and enabling DNS routing on each device is a separate user step.'}}
export async function readCloudDNS(username:string,cursor?:string){
 const row=await account(username),data=await provider(row.profile,row.apiKey,'/denylist'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
 return {profile:row.profile,domains:(data.data||[]).map((item:any)=>({domain:item.id,active:item.active!==false})),cursor:data.meta?.pagination?.cursor||null,deviceRoutingVerified:false}
}
export async function setCloudDNSDomain(username:string,input:unknown){
 const args=z.object({domain:dnsDomain,blocked:z.boolean()}).parse(input),row=await account(username)
 await provider(row.profile,row.apiKey,'/denylist'+(args.blocked?'':'/'+encodeURIComponent(args.domain)),args.blocked?'POST':'DELETE',args.blocked?{id:args.domain,active:true}:undefined)
 // Read every returned page: a successful HTTP response alone is not verification.
 let cursor:string|undefined,found=false;const seen=new Set<string>()
 do{const page=await readCloudDNS(username,cursor);if(page.domains.some((x:any)=>x.domain===args.domain&&x.active)){found=true;break}cursor=page.cursor||undefined;if(cursor&&seen.has(cursor))throw new ApiError(502,'NextDNS pagination repeated. Rule status is uncertain; read before retrying.');if(cursor)seen.add(cursor)}while(cursor&&seen.size<100)
 if(cursor&&seen.size>=100)throw new ApiError(502,'NextDNS list is too large to verify in one request. Read before retrying.')
 if(found!==args.blocked)throw new ApiError(502,'NextDNS did not confirm the requested domain state. Read its rules before retrying.')
 return {saved:true,verified:true,domain:args.domain,blocked:found,profile:row.profile,deviceRoutingVerified:false}
}
export async function handleCloudDNS(request:Request,username:string){
 if(request.method==='GET')return json(await cloudDNSStatus(username))
 const input=await body(request)
 if(request.method==='PUT'){
  const args=z.object({profile:z.string().regex(/^[a-fA-F0-9]{6}$/),apiKey:z.string().min(10).max(512)}).parse(input)
  await provider(args.profile,args.apiKey,'/denylist')
  storage(await db().from('planner_cloud_dns').upsert({username,profile:args.profile,credentials:sealVmCredential({apiKey:args.apiKey}),updated_at:new Date().toISOString()},{onConflict:'username'}))
  return json(await cloudDNSStatus(username))
 }
 if(request.method==='POST'){
  if(input.action==='read'){const args=z.object({cursor:z.string().min(1).max(1000).optional()}).parse(input);return json(await readCloudDNS(username,args.cursor))}
  if(input.action==='domain')return json(await setCloudDNSDomain(username,input))
 }
 throw new ApiError(405,'Use GET, PUT or a supported POST action.')
}
