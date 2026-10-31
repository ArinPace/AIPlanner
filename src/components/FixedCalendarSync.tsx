import {useEffect,useState} from 'react'
import {fixedCalendarSync} from '../lib/api'
type Status={connected:boolean;identity:string|null;pending:boolean;error:string|null;syncedAt:string|null}
export function FixedCalendarSync(){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState('')
 useEffect(()=>{let stopped=false;const read=()=>{if(document.visibilityState==='hidden')return;void fixedCalendarSync<Status>().then(value=>{if(!stopped){setStatus(value);setError('')}}).catch(e=>{if(!stopped)setError(e.message)})};read();const timer=window.setInterval(read,30000);window.addEventListener('focus',read);return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',read)}},[])
 const message=error||status?.error||(status?.pending?'Google Calendar: automatic sync pending':status?.syncedAt?'Google Calendar: automatic sync on':'Fixed events sync automatically to Google Calendar')
 return <div className="fixed-calendar-sync" aria-label="Fixed event Google sync"><small role="status">{message}{status?.identity&&<span> · {status.identity}</span>}</small></div>
}
