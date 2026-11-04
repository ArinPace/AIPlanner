import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'

export type RunHistoryQuery={source?:'jobs'|'collections';kind?:'chat'|'sync';jobId?:string;chatId?:string;offset?:number;limit?:number}
/** Explicit field lists exclude leases, host credentials and provider session data. */
export async function readAgentRunHistory(username:string,args:RunHistoryQuery={}){
 const source=args.source||'jobs',offset=args.offset||0,limit=args.limit||20
 const fields=source==='jobs'?'id,kind,chat_id,schedule_slot,status,message,reply,error,created_at,finished_at':'id,trigger,status,summary,error,created_at,applied_at'
 let query=db().from(source==='jobs'?'planner_vm_jobs':'planner_agent_runs').select(fields,{count:'exact'}).eq('username',username)
 if(source==='jobs'){
  query=query.in('kind',args.kind?[args.kind]:['chat','sync'])
  if(args.chatId)query=query.eq('chat_id',args.chatId)
 }else if(args.kind||args.chatId)throw new ApiError(400,'Kind and chat filters apply to jobs, not legacy collections.')
 if(args.jobId){
  const run=storage(await query.eq('id',args.jobId).maybeSingle())
  if(!run)throw new ApiError(404,'Run not found in this account and source.')
  return {source,run,coverage:'Saved request/output/error only. Per-tool execution traces are not recorded; a completed status alone does not prove source coverage or saved updates.'}
 }
 const result=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit-1)
 const rows=storage(result) as unknown as Record<string,unknown>[]
 const runs:Record<string,unknown>[]=rows.map(row=>{
  const {message:_request,reply,...metadata}=row
  return {...metadata,...(source==='jobs'?{outputSummary:typeof reply==='string'?reply.slice(0,1200):null,outputTruncated:typeof reply==='string'&&reply.length>1200}:{})}
 })
 return {source,runs,total:result.count,offset,hasMore:offset+limit<(result.count||0),coverage:'Newest first. Jobs include scheduled reviews and manual chats; collections are legacy source-update outcomes. Read jobId for full saved request/output/error. Per-tool traces are not recorded.'}
}
