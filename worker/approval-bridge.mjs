// Only relay explicit runtime questions; never invent or automatically accept a grant.
export function approvalPersistence(params){
  if(params._meta?.codex_approval_kind!=='mcp_tool_call')return []
  const value=params._meta.persist
  return (Array.isArray(value)?value:[value]).filter(x=>x==='session' || x==='always')
}
export function runtimeQuestions(method, params) {
  if(method==='mcpServer/elicitation/request') {
    if(!['form','openai/form','openaiForm'].includes(params.mode))throw new Error('Unsupported approval mode.')
    if(params.requestedSchema?.type!=='object')throw new Error('Unsupported approval schema.')
    const properties=Object.entries(params.requestedSchema?.properties || {})
    if(!properties.length){
      if(typeof params.message!=='string' || !params.message.trim())throw new Error('Missing approval action.')
      const persist=approvalPersistence(params)
      return [{id:'confirmation',question:params.message,options:['Allow once',...(persist.includes('session')?['Allow for this session']:[]),...(persist.includes('always')?['Always allow this tool']:[]),'Decline']}]
    }
    if(properties.length>3)throw new Error('Unsupported approval form.')
    return properties.map(([id,field])=>{
      const options=field.type==='boolean'?['Allow','Decline']:field.type==='string' && Array.isArray(field.enum) && field.enum.every(v=>typeof v==='string')?field.enum:null
      if(!options?.length)throw new Error('Unsupported approval field.')
      return {id,question:[params.message,field.title,field.description].filter(Boolean).join('\n'),options}
    })
  }
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
    if(status.answers){
      if(method==='mcpServer/elicitation/request'){
        if(!Object.keys(params.requestedSchema.properties || {}).length){
          const choice=status.answers.confirmation
          if(choice==='Allow once')return {action:'accept',content:{}}
          const persist=choice==='Always allow this tool'?'always':choice==='Allow for this session'?'session':null
          if(persist && approvalPersistence(params).includes(persist))return {action:'accept',content:{},_meta:{persist}}
          return {action:'decline',content:null}
        }
        return {action:'accept',content:Object.fromEntries(questions.map(q=>[q.id,params.requestedSchema.properties[q.id].type==='boolean'?status.answers[q.id]==='Allow':status.answers[q.id]]))}
      }
      return {answers:Object.fromEntries(questions.map(q=>[q.id,{answers:[status.answers[q.id]]}]))}
    }
  }
  throw new Error('Approval request expired.')
}
