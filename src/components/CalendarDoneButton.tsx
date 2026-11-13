import {useState} from 'react'
import type {CalendarEvent,Occurrence} from '../types'
import {occurrenceChecked} from '../lib/eventChecklist'
export function CalendarDoneButton({item,leaves,onDone}:{item:Occurrence;leaves:Occurrence[];onDone:(event:CalendarEvent,start:Date)=>Promise<string>}){
 const [saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const done=leaves.length>0&&leaves.every(leaf=>occurrenceChecked(leaf.event,leaf.start))
 if(item.event.eventKind==='folder'||!leaves.length)return null
 async function complete(){if(saving||done)return;setSaving(true);setError('');setMessage('Queued completion');try{setMessage(await onDone(item.event,item.start))}catch(e){setError(e instanceof Error?e.message:'Could not save completion.')}finally{setSaving(false)}}
 return <span className="calendar-completion-action"><button type="button" className={'calendar-done-button'+(done?' is-done':'')} disabled={saving||done} aria-label={(done?'Completed: ':'Mark done: ')+item.event.title} onClick={()=>void complete()} title={message||'Mark this block done; linked checklist completes after every required block.'}>{saving?'Queued…':done?'✓ Done':'Done'}</button>{error&&<span role="alert" className="calendar-completion-error">{error}</span>}{message&&<span className="sr-only" role="status">{message}</span>}</span>
}
