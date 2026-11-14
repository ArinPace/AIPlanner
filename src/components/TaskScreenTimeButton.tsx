import {ScreenTimeIcon} from './Icons'
import {useState} from 'react'
import {nativeRequest,supportsScreenTime} from '../lib/platform'
import {replicaContext} from '../lib/localReplica'
import type {TaskScreenTimeWindow} from '../lib/taskScreenTime'
export function TaskScreenTimeButton({task}:{task:TaskScreenTimeWindow}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 if(!supportsScreenTime())return null
 return <span className="task-screen-time-action"><button type="button" className="task-screen-time-button" aria-label={'Screen Time for '+task.title} title="Screen Time" aria-busy={busy} disabled={busy} onClick={event=>{
  event.stopPropagation();setBusy(true);setError('')
  void nativeRequest({action:'taskScreenTime',account:replicaContext().account,task}).catch(error=>setError(error instanceof Error&&/Unsupported native action/i.test(error.message)?'Update the iPhone app to use task blocking.':error instanceof Error?error.message:'Could not open task blocking.')).finally(()=>setBusy(false))
 }}><ScreenTimeIcon/></button>{error&&<span className="form-error" role="alert">{error}</span>}</span>
}
