import {useState} from 'react'
import type {VmJob} from '../lib/vm'

export function EditChatMessage({job,onClose,onSave}:{job:VmJob;onClose:()=>void;onSave:(message:string)=>Promise<void>}){
 const [message,setMessage]=useState(job.message),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <div className="modal-backdrop" onMouseDown={()=>{if(!busy)onClose()}}><form role="dialog" aria-modal="true" aria-label="Edit message" className="event-modal" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape' && !busy)onClose()}} onSubmit={async e=>{e.preventDefault();if(busy || !message.trim())return;setBusy(true);setError('');try{await onSave(message)}catch(error){setError(error instanceof Error?error.message:'Could not edit this message.');setBusy(false)}}}>
  <h2>Edit message</h2><p className="quiet">Save as a new branch. The original chat stays intact; its later messages are excluded from the new branch.</p>
  <label className="field"><span>Message</span><textarea autoFocus aria-label="Edited message" value={message} onChange={e=>setMessage(e.target.value)} rows={7} maxLength={12000} required disabled={busy}/></label>
  {Boolean(job.attachments?.length) && <p className="quiet">The original attachments will be kept with this message.</p>}
  {error && <p role="alert" className="form-error">{error}</p>}
  <div className="modal-actions-right"><button type="button" className="text-btn" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy || !message.trim()}>{busy?'Creating branch…':'Save & branch'}</button></div>
 </form></div>
}
