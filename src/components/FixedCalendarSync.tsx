import {useEffect,useState} from 'react'
import {calendarAccounts,fixedCalendarSync} from '../lib/api'
import {APP_TIME_ZONE} from '../lib/timezone'
import {GoogleCalendarAccounts} from './GoogleCalendarAccounts'
import type {VmState} from '../lib/vm'
type Status={reviewRequired?:boolean;connected:boolean;identity:string|null;pending:boolean;error:string|null;syncedAt:string|null}
export function FixedCalendarSync(){
 const [accounts,setAccounts]=useState<VmState['google']>(),[managing,setManaging]=useState(false)
 async function refreshAccounts(){setAccounts(await calendarAccounts<VmState['google']>())}
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState('')
 useEffect(()=>{let stopped=false;const read=()=>{if(document.visibilityState==='hidden')return;void fixedCalendarSync<Status>().then(value=>{if(!stopped){setStatus(value);setError('')}}).catch(e=>{if(!stopped)setError(e.message)})};read();const timer=window.setInterval(read,30000);window.addEventListener('focus',read);return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',read)}},[])
 const message=error||status?.error||(status?.reviewRequired?'Google Calendar: awaiting agent review':status?.pending?'Google Calendar: reviewed changes publishing':status?.syncedAt?'Google Calendar: reviewed changes synced':'Fixed events are staged for agent review before Google sync')
 const syncedAt=status?.syncedAt?new Date(status.syncedAt):null
 const lastSynced=syncedAt&&Number.isFinite(syncedAt.getTime())?syncedAt:null
 return <div className="fixed-calendar-sync" aria-label="Fixed event Google sync"><small role="status">{message}{status?.identity&&<span> · {status.identity}</span>}</small><small>Last synced: {lastSynced?<time dateTime={lastSynced.toISOString()}>{lastSynced.toLocaleString('en-US',{timeZone:APP_TIME_ZONE,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time>:status?'Not yet':error?'Unavailable':'Loading…'}</small><button type="button" onClick={()=>{setManaging(value=>!value);void refreshAccounts().catch(e=>setError(e.message))}}>Manage Google calendars</button>{managing&&<GoogleCalendarAccounts google={accounts} refresh={refreshAccounts} calendarOnly/>}</div>
}
