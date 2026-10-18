import {useEffect,useState} from 'react'
import {noteHistoryRequest} from '../lib/api'
import {PlannerDate as Date} from '../lib/timezone'
type Version={id:number;name:string;kind:string;changed_fields:string[];created_at:string;files_revision:number}
type Page={versions:Version[];hasMore:boolean;nextBefore:number|null}
type Detail=Version&{before:{name:string;content:string}|null;after:{name:string;content:string}|null;offset:number;hasMore:boolean}
export function NoteHistory({noteId,dirty}:{noteId:string;dirty:boolean}){
 const [page,setPage]=useState<Page|null>(null),[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let cancelled=false;void noteHistoryRequest<Page>(noteId).then(value=>{if(!cancelled)setPage(value)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[noteId])
 async function more(){if(!page?.nextBefore||busy)return;setBusy(true);setError('');try{const next=await noteHistoryRequest<Page>(noteId,{before:page.nextBefore});setPage({...next,versions:[...page.versions,...next.versions]})}catch(e){setError(e instanceof Error?e.message:'Could not load history.')}finally{setBusy(false)}}
 async function open(id:number,offset=0){setBusy(true);setError('');try{setDetail(await noteHistoryRequest<Detail>(noteId,{versionId:id,offset}))}catch(e){setError(e instanceof Error?e.message:'Could not load version.')}finally{setBusy(false)}}
 return <section className="note-history" aria-label="Note history">
  <h2>History</h2><p>Saved changes to your planning notes. Earlier edits before history was enabled are unavailable.</p>
  {dirty&&<p role="status">Your unsaved edits are not in history yet.</p>}
  {error&&<p role="alert">{error}</p>}
  {!page&&!error?<p>Loading history…</p>:!page?.versions.length?<p>No saved versions yet. History tracks Goals, To do, Want To Do and Agent To Do.</p>:<ol>{page.versions.map(version=><li key={version.id}><button type="button" disabled={busy} onClick={()=>void open(version.id)} aria-pressed={detail?.id===version.id}><time dateTime={version.created_at}>{new Date(version.created_at).toLocaleString()}</time> · {version.kind==='baseline'?'Starting version':version.kind} · {version.name}<small>{version.changed_fields.join(', ')}</small></button></li>)}</ol>}
  {page?.hasMore&&<button type="button" disabled={busy} onClick={()=>void more()}>Older changes</button>}
  {detail&&<div className="note-history-detail"><h3>Saved change</h3><div className="note-history-comparison"><section><h4>Before</h4><strong>{detail.before?.name}</strong><pre>{detail.before?.content??'Note did not exist.'}</pre></section><section><h4>After</h4><strong>{detail.after?.name}</strong><pre>{detail.after?.content??'Note removed from Files.'}</pre></section></div>{detail.hasMore&&<button type="button" disabled={busy} onClick={()=>void open(detail.id,detail.offset+20000)}>Continue reading</button>}</div>}
 </section>
}
