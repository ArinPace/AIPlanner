import {useEffect,useState} from 'react'
import {fixedCalendarSync} from '../lib/api'
type Status={reviewRequired?:boolean;connected:boolean;identity:string|null;pending:boolean;error:string|null;syncedAt:string|null}
export function FixedCalendarSync(){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState('')
 useEffect(()=>{let stopped=false;const read=()=>{if(document.visibilityState==='hidden')return;void fixedCalendarSync<Status>().then(value=>{if(!stopped){setStatus(value);setError('')}}).catch(e=>{if(!stopped)setError(e.message)})};read();const timer=window.setInterval(read,30000);window.addEventListener('focus',read);return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',read)}},[])
 const message=error||status?.error||(status?.reviewRequired?'Google Calendar: awaiting agent review':status?.pending?'Google Calendar: reviewed changes publishing':status?.syncedAt?'Google Calendar: reviewed changes synced':'Fixed events are staged for agent review before Google sync')
 return <div className="fixed-calendar-sync" aria-label="Fixed event Google sync"><small role="status">{message}{status?.identity&&<span> · {status.identity}</span>}</small></div>
}
