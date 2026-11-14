import {CheckIcon} from './Icons'
import {useState} from 'react'
import type {CalendarEvent,Occurrence} from '../types'
import {occurrenceChecked} from '../lib/eventChecklist'
export function CalendarDoneButton({checkbox=false,item,leaves,onDone}:{checkbox?:boolean;item:Occurrence;leaves:Occurrence[];onDone:(event:CalendarEvent,start:Date)=>Promise<string>}){
 const [saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const done=leaves.length>0&&leaves.every(leaf=>occurrenceChecked(leaf.event,leaf.start))
 if(item.event.eventKind==='folder'||!leaves.length)return null
 async function complete(){if(saving||done)return;setSaving(true);setError('');setMessage('Queued completion');try{setMessage(await onDone(item.event,item.start))}catch(e){setError(e instanceof Error?e.message:'Could not save completion.')}finally{setSaving(false)}}
 return <span className="calendar-completion-action"><button type="button" role={checkbox?'checkbox':undefined} aria-checked={checkbox?done:undefined} className={'calendar-done-button'+(checkbox?' is-checkbox':'')+(done?' is-done':saving?' is-pending':'')} disabled={saving||done} aria-busy={saving} aria-label={(done?'Completed: ':'Mark done: ')+item.event.title} onClick={()=>void complete()} title={message||'Mark this block done; linked checklist completes after every required block.'}>{(!checkbox||done||saving)&&<CheckIcon size={checkbox?16:20}/>}</button>{error&&<span role="alert" className="calendar-completion-error">{error}</span>}{message&&<span className="sr-only" role="status">{message}</span>}</span>
}
