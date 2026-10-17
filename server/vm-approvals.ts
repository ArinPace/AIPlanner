import { ApiError, db, json } from './cloud.js'
import { uuid } from './vm-validation.js'

export type ApprovalQuestion = {id:string; question:string; options:string[]}
export function approvalQuestions(value: unknown): ApprovalQuestion[] {
  if(!Array.isArray(value) || !value.length || value.length>3)throw new ApiError(400,'Unsupported approval request.')
  const result=value.map(q=>{
    if(!q || typeof q.id!=='string' || !q.id || q.id.length>200 || typeof q.question!=='string' || q.question.length>12000 || !Array.isArray(q.options) || !q.options.length || q.options.length>10 || q.options.some((x:unknown)=>typeof x!=='string' || x.length>500))throw new ApiError(400,'Unsupported approval question.')
    return {id:q.id,question:q.question,options:q.options} as ApprovalQuestion
  })
  if(new Set(result.map(q=>q.id)).size!==result.length)throw new ApiError(400,'Duplicate approval question.')
  return result
}
export function approvalAnswers(questions:ApprovalQuestion[], value:unknown) {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new ApiError(400,'Choose an answer for every approval question.')
  const answers=value as Record<string,unknown>
  if(Object.keys(answers).length!==questions.length || questions.some(q=>typeof answers[q.id]!=='string' || !q.options.includes(answers[q.id] as string)))throw new ApiError(400,'Choose one of the displayed approval options.')
  return Object.fromEntries(questions.map(q=>[q.id,answers[q.id] as string]))
}
async function activeJob(username:string,id:unknown,hostId?:string,lease?:unknown){
  if(!uuid(id))throw new ApiError(400,'Choose an active task.')
  let query=db().from('planner_vm_jobs').select('id,lease,host_id').eq('username',username).eq('id',id).eq('status','running').gt('lease_until',new Date().toISOString())
  if(hostId)query=query.eq('host_id',hostId).eq('lease',lease)
  const {data,error}=await query.maybeSingle()
  if(error)throw new ApiError(503,'Could not verify this task.')
  if(!data)throw new ApiError(409,'This task was cancelled or expired.')
  return data
}
export async function workerApproval(host:{id:string;username:string}, input:Record<string,unknown>){
  const job=await activeJob(host.username,input.jobId,host.id,input.lease)
  if(input.action==='create'){
    const questions=approvalQuestions(input.questions)
    const {data,error}=await db().from('planner_vm_approvals').insert({username:host.username,host_id:host.id,job_id:job.id,lease:job.lease,questions}).select('id,expires_at').single()
    if(error)throw new ApiError(503,'Could not request approval.')
    return json(data)
  }
  if(!uuid(input.id))throw new ApiError(400,'Choose an approval request.')
  const {data,error}=await db().from('planner_vm_approvals').select('answers,expires_at').eq('id',input.id).eq('username',host.username).eq('job_id',job.id).eq('host_id',host.id).eq('lease',job.lease).maybeSingle()
  if(error || !data)throw new ApiError(404,'Approval request not found.')
  if(Date.parse(data.expires_at)<=Date.now())throw new ApiError(409,'Approval request expired.')
  return json(data)
}
export async function answerApproval(username:string,input:Record<string,unknown>){
  if(!uuid(input.id))throw new ApiError(400,'Choose an approval request.')
  const {data,error}=await db().from('planner_vm_approvals').select('id,job_id,lease,questions,answers,expires_at').eq('id',input.id).eq('username',username).maybeSingle()
  if(error || !data)throw new ApiError(404,'Approval request not found.')
  const job=await activeJob(username,data.job_id)
  if(job.lease!==data.lease || data.answers || Date.parse(data.expires_at)<=Date.now())throw new ApiError(409,'Approval request is no longer pending.')
  const answers=approvalAnswers(approvalQuestions(data.questions),input.answers)
  const updated=await db().from('planner_vm_approvals').update({answers,answered_at:new Date().toISOString()}).eq('username',username).eq('id',data.id).is('answers',null).select('id')
  if(updated.error || !updated.data?.length)throw new ApiError(409,'Approval was already answered.')
  return json({ok:true})
}
