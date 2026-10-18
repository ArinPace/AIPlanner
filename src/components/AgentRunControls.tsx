import {useState} from 'react'
import {agentAction} from '../lib/agent'
import type {VmJob} from '../lib/vm'

export function AgentRunControls({job,onChanged,onError}:{job:VmJob;onChanged:()=>Promise<unknown>;onError:(error:string)=>void}){
 const [busy,setBusy]=useState(false)
 async function control(action:'pause'|'resume'|'cancel'){
  if(busy)return
  setBusy(true)
  try{await agentAction('vm/'+action,{id:job.id,chatId:job.chat_id});await onChanged()}
  catch(error){onError(error instanceof Error?error.message:'Could not update this task.')}
  finally{setBusy(false)}
 }
 return <span className="assistant-run-controls">
  {job.kind==='chat' && job.chat_id && <button type="button" disabled={busy} onClick={()=>void control(job.status==='paused'?'resume':'pause')}>{busy?'Updating…':job.status==='paused'?'Resume':'Pause'}</button>}
  <button type="button" disabled={busy} onClick={()=>void control('cancel')}>Stop</button>
 </span>
}
