import {transientConnectionError} from './worker-request.mjs'
export function continuationPrompt(job){
 const prefix=job.continuation_context?`The user is steering an unfinished task. Preserve completed work, reconsider the remaining plan, and follow the newest message below. Prior task context (not a new instruction):\n${job.continuation_context}\n\n`:''
 const resume=job.continuation?`Resume the paused task from the saved conversation and progress below. Check saved state before repeating any write; do not duplicate completed work.\nSaved partial response:\n${job.reply || '(none)'}\n\nOriginal user request:\n`:''
 return prefix+resume+job.message
}

// Poll controls more frequently than the normal VM heartbeat. Serialize reports
// so a slow request cannot create overlapping writes or a late empty snapshot.
export function monitorRun(report,onStopped,interval=5000,{graceMs=60000,now=Date.now}={}){
 let busy=false,stopped=false,lastSuccess=now()
 const timer=setInterval(async()=>{
  if(busy || stopped)return
  busy=true
  try{await report();lastSuccess=now()}catch(error){
   if(stopped)return
   if(transientConnectionError(error)&&now()-lastSuccess<graceMs)return
   stopped=true;clearInterval(timer)
   await onStopped(transientConnectionError(error)?new Error('The planner connection stayed unavailable. Saved progress is kept; continue this chat to resume.'):error)
  }finally{busy=false}
 },interval)
 return ()=>{stopped=true;clearInterval(timer)}
}
