import {useEffect,useState} from 'react'
import {loadFiles,peekFilesCache,saveFiles} from '../lib/api'
import {checklistSchedule} from '../lib/checklistSchedule'
import {useChecklistSort} from '../lib/checklistSortMode'
import {urgencyColor} from '../lib/urgencyColor'
import {ChatMarkdown} from './ChatMarkdown'
import type {CalendarEvent} from '../types'
export function CombinedChecklist({active,events}:{active:boolean;events:CalendarEvent[]}){
 const [state,setState]=useState(()=>peekFilesCache()),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const sort=useChecklistSort()
 useEffect(()=>{if(active)void loadFiles({maxAge:0}).then(setState).catch(e=>setError(e.message))},[active])
 const rows=(state?.files||[]).filter(note=>note.systemRole==='work'||note.systemRole==='todo'||note.name.toLowerCase()==='to do').flatMap(note=>{
  const labels=checklistSchedule(events,note.id)
  return note.content.split('\n').flatMap((line,index)=>{const match=line.match(/^\s*- \[([ xX])\] (.*)$/);if(!match)return [];const id=line.match(/\[item:([^\]]+)\]/)?.[1],urgency=line.match(/\[urgency:(\d+)\]/)?.[1];return [{note,index,checked:match[1].toLowerCase()==='x',urgency:urgency?Number(urgency):null,text:match[2].replace(/\[(?:item:[^\]]+|urgency:\d+)\]\s*/g,''),label:id?labels[id]:undefined}]})
 }).sort((a,b)=>Number(a.checked)-Number(b.checked)||(sort==='urgency'?(b.urgency??-1)-(a.urgency??-1):(a.label?.timestamp||Infinity)-(b.label?.timestamp||Infinity)))
 async function toggle(row:typeof rows[number]){if(!state||busy)return;setBusy(true);setError('');const content=row.note.content.split('\n').map((line,index)=>index===row.index?line.replace(/\[([ xX])\]/,row.checked?'[ ]':'[x]'):line).join('\n');try{const next={...state,files:state.files.map(n=>n.id===row.note.id?{...n,content,richText:undefined,richTextSource:undefined,updatedAt:new Date().toISOString()}:n)};setState(next);await saveFiles(next);setState(await loadFiles({maxAge:0}))}catch(e){setError(e instanceof Error?e.message:'Could not save');setState(await loadFiles({maxAge:0}))}finally{setBusy(false)}}
 return <div className="apple-note-scroll combined-checklist">{error&&<p role="alert">{error}</p>}{rows.map(row=><div className="combined-checklist-row" key={row.note.id+':'+row.index}><input type="checkbox" aria-label={'Complete '+row.text} checked={row.checked} disabled={busy} onChange={()=>void toggle(row)}/><span style={urgencyColor(row.urgency)} className="combined-urgency">{row.urgency??'–'}</span><div style={{textDecoration:row.checked?'line-through':undefined}}><ChatMarkdown text={row.text}/><small>{row.note.systemRole==='work'?'Work':'Tasks'}</small></div><span className="combined-time" title={row.label?.title}>{row.label?.text||'--:--'}</span></div>)}</div>
}
