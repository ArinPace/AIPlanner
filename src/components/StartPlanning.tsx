import {useState} from 'react'
import {planningRequest} from '../lib/api'
export function StartPlanning({ready,revision,disabled,onStarted}:{ready:boolean;revision:number;disabled:boolean;onStarted:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function start(){if(busy)return;setBusy(true);setError('');try{await planningRequest({action:'start',revision});await onStarted()}catch(e){setError(e instanceof Error?e.message:'Could not start planning.');await onStarted().catch(()=>{})}finally{setBusy(false)}}
 return <section className="planning-start-card" aria-label="Calendar setup">
  <h2>{ready?'Ready to build your calendar?':'Let’s set up your calendar first'}</h2>
  <p>{ready?'Your setup is ready. Press the button when you want the agent to begin filling your calendar.':'Fill in Goals and To do, then discuss your routine and task estimates here. Your calendar stays unchanged during setup.'}</p>
  <button type="button" className="primary-btn" disabled={!ready||disabled||busy} onClick={()=>void start()}>{busy?'Starting your planner…':'Start planning my calendar'}</button>
  {!ready&&<small>The button becomes available when setup is ready.</small>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </section>
}
