import {useState} from 'react'
import {planningRequest} from '../lib/api'
export function StartPlanning({revision,disabled,onStarted}:{revision:number;disabled:boolean;onStarted:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 async function start(){if(busy)return;setBusy(true);setError('');setNotice('');try{const result=await planningRequest<{alreadyRunning?:boolean;status?:string}>({action:'start',revision});setNotice(result.alreadyRunning?(result.status==='paused'?'A calendar review is paused in Main Chat. Resume it there.':'A calendar review is already active in Main Chat.'):result.status==='waiting'?'Calendar review queued in Main Chat.':'Calendar review started in Main Chat.');await onStarted()}catch(e){setError(e instanceof Error?e.message:'Could not start planning.');await onStarted().catch(()=>{})}finally{setBusy(false)}}
 return <section className="assistant-planning-toolbar" aria-label="Calendar planning">
  <button type="button" className="primary-btn" disabled={disabled||busy} onClick={()=>void start()}>{busy?'Starting review…':'Start planning my calendar'}</button>
  <span>Review Files, context and connected sites</span>
  {notice&&<small role="status">{notice}</small>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </section>
}
