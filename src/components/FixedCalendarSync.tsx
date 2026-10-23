import {useEffect,useState} from 'react'
import {fixedCalendarSync} from '../lib/api'
type Status={connected:boolean;identity:string|null;pending:boolean;error:string|null;syncedAt:string|null}
export function FixedCalendarSync(){
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{let stopped=false;const read=()=>{if(document.visibilityState==='hidden')return;void fixedCalendarSync<Status>().then(value=>{if(!stopped)setStatus(value)}).catch(e=>{if(!stopped)setError(e.message)})};read();const timer=window.setInterval(read,30000);return()=>{stopped=true;window.clearInterval(timer)}},[])
 async function sync(){setBusy(true);setError('');try{setStatus(await fixedCalendarSync<Status>(true))}catch(e){setError(e instanceof Error?e.message:'Could not sync.')}finally{setBusy(false)}}
 return <div className="fixed-calendar-sync" aria-label="Fixed event Google sync"><small>{error||status?.error||(status?.pending?'Fixed events: Google sync pending':status?.syncedAt?'Fixed events synced to Google Calendar':'Fixed events sync to Google Calendar')}{status?.identity&&<span> · {status.identity}</span>}</small><button className="text-btn" type="button" disabled={busy||!status?.connected} onClick={()=>void sync()}>{busy?'Syncing…':'Sync fixed events'}</button></div>
}
