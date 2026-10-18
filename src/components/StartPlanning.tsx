import {useState} from 'react'
import {planningRequest} from '../lib/api'
export function StartPlanning({revision,disabled,onStarted}:{revision:number;disabled:boolean;onStarted:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 async function start(){if(busy)return;setBusy(true);setError('');setNotice('');try{const result=await planningRequest<{alreadyRunning?:boolean;status?:string}>({action:'start',revision});setNotice(result.alreadyRunning?(result.status==='paused'?'A calendar review is paused in Main Chat. Resume it there.':'A calendar review is already active in Main Chat.'):result.status==='waiting'?'Calendar review queued in Main Chat.':'Calendar review started in Main Chat.');await onStarted()}catch(e){setError(e instanceof Error?e.message:'Could not start planning.');await onStarted().catch(()=>{})}finally{setBusy(false)}}
 return <>
  <button type="button" className="planning-icon-button" aria-label="Begin Planning" title="Begin Planning" disabled={disabled||busy} onClick={()=>void start()} aria-busy={busy}>
   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/></svg>
  </button>
  {notice&&<small className="planning-icon-feedback" role="status">{notice}</small>}
  {error&&<small className="planning-icon-feedback form-error" role="alert">{error}</small>}
 </>
}
