import {useEffect,useRef,useState} from 'react'
import {calendarHistoryRequest,loadCalendar,restoreCalendarVersion} from '../lib/api'
import {PlannerDate as Date} from '../lib/timezone'
type Version={id:number;calendar_key:string;event_id:string|null;title:string;kind:string;calendar_revision:number|null;created_at:string;before?:unknown;after?:unknown}
type Page={versions:Version[];hasMore:boolean;nextBefore:number|null}
export function CalendarHistory({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[page,setPage]=useState<Page|null>(null),[detail,setDetail]=useState<Version|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{ref.current?.showModal();void calendarHistoryRequest<Page>().then(setPage).catch(e=>setError(e.message))},[])
 async function restore(side:'before'|'after'){
  if(!detail||busy||!window.confirm('Restore this event version? Its saved times and details will replace the current version, if present. Other events will stay unchanged.'))return
  setBusy(true);setError('')
  try{const current=await loadCalendar({adopt:false});await restoreCalendarVersion({versionId:detail.id,revision:current.revision!,side,overwrite:true});window.dispatchEvent(new Event('planner-calendar-refresh'));setDetail(null);setPage(await calendarHistoryRequest<Page>())}catch(e){setError(e instanceof Error?e.message:'Could not restore event.')}finally{setBusy(false)}
 }
 return <dialog ref={ref} className="calendar-history-dialog" aria-label="Calendar history" onCancel={onClose}><header><h2>Calendar history</h2><button type="button" onClick={onClose} aria-label="Close calendar history">×</button></header><p>Saved event changes from when history was enabled. Restore individual events without replacing the rest of your calendar.</p>{error&&<p role="alert">{error}</p>}
 {detail?<><button type="button" onClick={()=>setDetail(null)}>Back to changes</button><h3>{detail.title}</h3>{(['before','after'] as const).map(side=><section key={side}><h4>{side==='before'?'Before':'After'}</h4><pre>{detail[side]?JSON.stringify(detail[side],null,2):'No event'}</pre>{detail.calendar_key==='internal'&&detail.event_id&&Boolean(detail[side])&&<button type="button" disabled={busy} onClick={()=>void restore(side)}>Restore this version</button>}</section>)}</>:<><ul>{page?.versions.map(version=><li key={version.id}><button type="button" onClick={()=>{setError('');void calendarHistoryRequest<{version:Version}>({versionId:version.id}).then(result=>setDetail(result.version)).catch(e=>setError(e.message))}}><strong>{version.title||'Untitled event'}</strong><small>{version.kind} · {new Date(version.created_at).toLocaleString()} · {version.calendar_key==='internal'?'Planner':'Google Calendar'}</small></button></li>)}</ul>{page?.hasMore&&<button type="button" onClick={()=>void calendarHistoryRequest<Page>({before:page.nextBefore!}).then(result=>setPage(old=>({...result,versions:[...(old?.versions||[]),...result.versions]}))).catch(e=>setError(e.message))}>Older changes</button>}{page&&!page.versions.length&&<p>No saved changes yet.</p>}</>}
 </dialog>
}
