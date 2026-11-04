import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {sourceHealthStatus} from './source-health.js'
import {VM_SOURCES,type VmSource} from '../src/lib/vm.js'
import {z} from 'zod'
export async function notificationInbox(request:Request,username:string){
 if(request.method==='PATCH'){
  const input=z.object({id:z.string().min(1).max(2000),checked:z.boolean()}).parse(await body(request))
  const rows=storage(await db().from('planner_notification_inbox').update({checked:input.checked}).eq('username',username).eq('id',input.id).select('id'))
  if(!rows.length)throw new ApiError(404,'Notification not found.')
  return json({ok:true})
 }
 if(request.method!=='GET')throw new ApiError(405,'Use GET or PATCH.')
 const [health,jobs]=await Promise.all([sourceHealthStatus(username),db().from('planner_vm_jobs').select('id,result,finished_at,created_at').eq('username',username).in('kind',['browser_check','browser_login']).order('created_at',{ascending:false}).limit(100)])
 const notices=health.issues.map(issue=>({username,id:issue.id,title:issue.title,message:issue.message,kind:'source'}))
 for(const job of storage(jobs)){
  const source=job.result?.source as VmSource
  if(job.result?.connected&&source in VM_SOURCES)notices.push({username,id:'connected:'+job.id,title:VM_SOURCES[source].name+' connected',message:'Connection verified. Your sign-in is saved on your private computer.',kind:'connection'})
 }
 if(notices.length)storage(await db().from('planner_notification_inbox').upsert(notices,{onConflict:'username,id',ignoreDuplicates:true}))
 const current=new Set(health.issues.map(issue=>issue.id))
 const rows=storage(await db().from('planner_notification_inbox').select('id,title,message,kind,checked,created_at').eq('username',username).order('created_at',{ascending:false}).limit(500))
 return json({items:rows.map(item=>({...item,active:item.kind==='source'&&current.has(item.id)}))})
}
