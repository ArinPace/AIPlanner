import { useEffect, useId, useRef, useState } from 'react'
import { CloseIcon } from './Icons'

export function RenameDialog({initialValue,kind,busy,error,onClose,onSave}:{initialValue:string;kind:string;busy:boolean;error:string;onClose:()=>void;onSave:(name:string)=>Promise<void>}) {
  const ref=useRef<HTMLDialogElement>(null),heading=useId()
  const [name,setName]=useState(initialValue)
  useEffect(()=>{ref.current?.showModal()},[])
  return <dialog ref={ref} className="files-dialog" aria-labelledby={heading} onCancel={e=>{e.preventDefault();if(!busy)onClose()}}><form onSubmit={e=>{e.preventDefault();void onSave(name.trim())}}>
    <div className="files-dialog-head"><h2 id={heading}>Rename {kind}</h2><button type="button" className="icon-btn" aria-label="Close rename dialog" disabled={busy} onClick={onClose}><CloseIcon/></button></div>
    <label className="field"><span>New name</span><input autoFocus required maxLength={100} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="files-dialog-actions"><button type="button" className="text-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary-btn" disabled={busy || !name.trim()}>{busy?'Saving...':'Rename'}</button></div>
  </form></dialog>
}
