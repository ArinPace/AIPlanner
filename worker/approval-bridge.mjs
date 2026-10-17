// Only relay explicit runtime questions; never invent or automatically accept a grant.
export function runtimeQuestions(method, params) {
  if (!['item/tool/requestUserInput','tool/requestUserInput'].includes(method)) throw new Error('Unsupported approval request.')
  if (!params.questions?.length || params.questions.length>3) throw new Error('Unsupported approval request.')
  return params.questions.map(q=>{
    if(q.isSecret || !q.options?.length)throw new Error('This question needs a different input flow.')
    return {id:q.id,question:q.question,options:q.options.map(o=>o.label)}
  })
}
export async function relayApproval(method,params,{api,job,report}){
  const questions=runtimeQuestions(method,params)
  const request=await api('approval',{action:'create',jobId:job.id,lease:job.lease,questions})
  await report()
  while(Date.now()<Date.parse(request.expires_at)){
    await new Promise(r=>setTimeout(r,2000))
    const status=await api('approval',{action:'poll',id:request.id,jobId:job.id,lease:job.lease})
    if(status.answers)return {answers:Object.fromEntries(questions.map(q=>[q.id,{answers:[status.answers[q.id]]}]))}
  }
  throw new Error('Approval request expired.')
}
