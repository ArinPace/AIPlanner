import {useState} from 'react'
import {agentAction} from '../lib/agent'
import type {VmState} from '../lib/vm'
export function GoogleCalendarAccounts({google,refresh}:{google:VmState['google'];refresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function connect(){setBusy(true);setError('');try{const result=await agentAction<{url:string}>('vm/google/connect',{});window.location.assign(result.url)}catch(e){setError(e instanceof Error?e.message:'Could not connect Google Calendar.');setBusy(false)}}
 async function select(id:string){setBusy(true);setError('');try{await agentAction('vm/google/select',{id});await refresh()}catch(e){setError(e instanceof Error?e.message:'Could not select this account.')}finally{setBusy(false)}}
 return <section className="assistant-settings-section"><h3>Google Calendar editing</h3><p>Connect your Google account to let the agent create and reschedule events on its primary calendar. Browser sign-in alone does not grant editing access.</p>
 {google?.accounts.map(account=><div className="assistant-site" key={account.id}><span>{account.identity}<small>{account.canEdit?'Event editing enabled':'Read-only — reconnect to enable editing'}</small></span><button type="button" disabled={busy||account.id===google.activeAccountId} onClick={()=>void select(account.id)}>{account.id===google.activeAccountId?'Selected':'Use account'}</button></div>)}
 <button type="button" disabled={busy} onClick={()=>void connect()}>{google?.connected?'Reconnect / add Google account':'Connect Google Calendar'}</button>{error&&<p role="alert">{error}</p>}</section>
}
