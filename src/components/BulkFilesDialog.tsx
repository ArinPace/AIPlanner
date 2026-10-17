import { useEffect, useRef, useState } from 'react'
import { descendantIds, folderPath, type FilesState } from '../lib/files'
import { TAG_COLORS } from '../lib/colors'

export function BulkFilesDialog({ state, ids, mode, busy, error, onClose, onSave }: {
  state: FilesState; ids: string[]; mode: 'move' | 'organize'; busy: boolean; error: string
  onClose: () => void; onSave: (destination: string | null, color: string, labels: string) => Promise<void>
}) {
  const ref=useRef<HTMLDialogElement>(null)
  const [destination,setDestination]=useState<string|null>(null)
  const [color,setColor]=useState('')
  const [labels,setLabels]=useState('')
  useEffect(()=>{ref.current?.showModal()},[])
  const selectedFolders=state.folders.filter(f=>ids.includes(f.id))
  const excluded=new Set(selectedFolders.flatMap(f=>[...descendantIds(state.folders,f.id)]))
  const needsFolder=[...state.files,...(state.documents ?? [])].some(f=>ids.includes(f.id) && !excluded.has(f.folderId))
  return <dialog ref={ref} className="files-dialog" aria-labelledby="bulk-files-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}><form onSubmit={e=>{e.preventDefault();void onSave(destination,color,labels)}}>
    <h2 id="bulk-files-title">{mode==='move'?'Move selected items':'Organize selected folders'}</h2>
    <p>{ids.length} selected item(s){mode==='organize'?`; changes apply to ${selectedFolders.length} selected folder(s).`:'. Folder contents move with their folder.'}</p>
    <fieldset disabled={busy} className="files-fields">{mode==='move' ? <label className="field"><span>Destination folder</span><select autoFocus required={needsFolder} value={destination ?? ''} onChange={e=>setDestination(e.target.value || null)}><option value="" disabled={needsFolder}>{needsFolder?'Choose a folder':'Files (top level)'}</option>{state.folders.filter(f=>!excluded.has(f.id)).map(f=>({id:f.id,path:folderPath(state.folders,f.id).map(p=>p.name).join(' / ')})).sort((a,b)=>a.path.localeCompare(b.path)).map(f=><option key={f.id} value={f.id}>{f.path}</option>)}</select></label> : <><label className="field"><span>Folder color</span><select autoFocus value={color} onChange={e=>setColor(e.target.value)}><option value="">Keep existing colors</option>{TAG_COLORS.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label className="field"><span>Add labels, separated by commas</span><input value={labels} onChange={e=>setLabels(e.target.value)} placeholder="School, Fall semester"/><small>Existing labels are kept.</small></label></>}</fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}<div className="files-dialog-actions"><button type="button" className="text-btn" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy || mode==='organize' && !color && !labels.trim()}>{busy?'Saving...':'Apply'}</button></div>
  </form></dialog>
}
