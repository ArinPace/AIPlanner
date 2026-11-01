import {useEffect,useState} from 'react'
import {loadCalendar,loadFiles} from '../lib/api'
import {isIPhoneApp,nativeRequest} from '../lib/platform'
import {readReplica,replicaStatus,REPLICA_CHANGED} from '../lib/localReplica'

type WidgetStatus={available:boolean;generatedAt:number;validUntil:number;eventCount:number;currentTask:string;expired?:boolean}
export function LocalCopySettings(){
 const [copy,setCopy]=useState<Awaited<ReturnType<typeof replicaStatus>>|null>(null)
 const [widget,setWidget]=useState<WidgetStatus|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{
  let cancelled=false
  async function update(){try{const next=await replicaStatus();if(!cancelled)setCopy(next);if(isIPhoneApp()){const status=await nativeRequest<WidgetStatus>({action:'widgetStatus'});if(!cancelled)setWidget({...status,expired:status.validUntil<Date.now()/1000})}}catch(e){if(!cancelled)setError(e instanceof Error?e.message:String(e))}}
  void update();window.addEventListener(REPLICA_CHANGED,update)
  return()=>{cancelled=true;window.removeEventListener(REPLICA_CHANGED,update)}
 },[])
 async function sync(){setBusy(true);setError('');try{await Promise.all([loadCalendar({adopt:false}),loadFiles()]);setCopy(await replicaStatus());if(isIPhoneApp()){await nativeRequest({action:'reloadWidgets'});const status=await nativeRequest<WidgetStatus>({action:'widgetStatus'});setWidget({...status,expired:status.validUntil<Date.now()/1000})}}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function download(){setError('');try{const text=JSON.stringify(await readReplica(),null,2);if(isIPhoneApp()){await nativeRequest({action:'downloadText',name:'planner-local-copy.json',text});return}const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='planner-local-copy.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:String(e))}}
 const stamp=(kind:string)=>{const part=copy?.parts.find(p=>p.kind===kind);return part?new Date(part.savedAt).toLocaleString():'Not synced yet'}
 return <section className="local-copy-settings" aria-label="Local copy and widgets">
  <h3>Local copy{isIPhoneApp()?' & widgets':''}</h3>
  <p className="quiet">Calendar: {stamp('calendar')}<br/>Notes & files: {stamp('files')}</p>
  {widget&&<p className="quiet">{!widget.available?'Widget sharing is unavailable. Enable App Groups for both iPhone targets.':widget.generatedAt===0?'Widgets: open Planner and sync your calendar.':widget.expired?'Widget schedule has expired. Sync again.':<>Widgets synced {new Date(widget.generatedAt*1000).toLocaleString()} · {widget.eventCount} activities{widget.currentTask&&<><br/>Current: {widget.currentTask}</>}</>}</p>}
  <button type="button" className="today-btn" disabled={busy} onClick={()=>void sync()}>{busy?'Syncing…':'Sync local copy'+(isIPhoneApp()?' & widgets':'')}</button>
  <button type="button" className="today-btn" onClick={()=>void download()}>Download local copy JSON</button>
  <p className="quiet settings-hint">Saved automatically on this device. Includes calendar, notes, folders and file details; PDF attachments remain online. This copy never overwrites newer server data.</p>
  {(error||copy?.error||copy?.widgetError)&&<p className="form-error" role="alert">{error||copy?.error||copy?.widgetError}{isIPhoneApp()&&' If your iPhone app is older, install the latest build.'}</p>}
 </section>
}
