import {useEffect,useState} from 'react'
import {agentAction,agentRequest} from '../lib/agent'
type Row={content:string;revision:number;updatedAt:string|null}
export function AgentInstructions(){
 const [row,setRow]=useState<Row|null>(null),[content,setContent]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{let cancelled=false;void agentRequest<Row>('instructions').then(value=>{if(!cancelled){setRow(value);setContent(value.content)}}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[])
 async function save(){if(!row||busy)return;setBusy(true);setError('');setNotice('');try{const saved=await agentAction<Row>('instructions',{revision:row.revision,content});setRow(saved);setContent(saved.content);setNotice('Live instructions saved. Applies to the next chat turn or scheduled run.')}catch(e){setError(e instanceof Error?e.message:'Could not save instructions.')}finally{setBusy(false)}}
 return <section className="assistant-settings-section"><h3>Live agent instructions</h3><p>Personal behavior rules used in chats and scheduled runs. The agent can update these when you ask. An empty field uses the built-in planner rules.</p><form onSubmit={event=>{event.preventDefault();void save()}}><label>Agent instructions<textarea aria-label="Live agent instructions" rows={6} maxLength={20000} disabled={!row||busy} value={content} onChange={event=>{setContent(event.target.value);setNotice('')}}/></label><button type="submit" disabled={!row||busy||content===row.content}>{busy?'Saving…':'Save live instructions'}</button></form>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="form-error">{error}</p>}</section>
}
