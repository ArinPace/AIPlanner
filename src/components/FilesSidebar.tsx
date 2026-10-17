import { useState, type DragEvent } from 'react'
import type { FilesState } from '../lib/files'
import { navigationFolders } from '../lib/fileActions'
import { CloseIcon, PlusIcon, TrashIcon } from './Icons'

export const FILE_DRAG = 'application/x-ai-planner-items'
export function FilesSidebar({ state, folderId, bin, count, busy, collapsed, onCollapse, onOpen, onBin, onNew, onClose, onDrag, onTrash }: {
  state: FilesState; folderId: string | null; bin: boolean; count: number; busy: boolean
  collapsed: Set<string>; onCollapse: (id: string) => void
  onOpen: (id: string | null) => void; onBin: () => void; onNew: () => void; onClose: () => void
  onDrag: (event: DragEvent, id: string) => void; onTrash: (ids: string[]) => void
}) {
  const [overBin, setOverBin] = useState(false)
  return <aside className="files-sidebar" aria-label="Folders">
    <div className="files-sidebar-heading"><button className="text-btn files-root-button" aria-label="Open Files root" title="Show Files without opening a folder" onClick={() => onOpen(null)}>Files</button><button className="icon-btn" aria-label="New folder" disabled={busy} onClick={onNew}><PlusIcon/></button><button className="icon-btn" aria-label="Hide Files sidebar" onClick={onClose}><CloseIcon/></button></div>
    <button type="button" aria-label="Open Files Bin" className={'folder-nav files-bin-target '+(bin?'is-active ':'')+(overBin?'is-drag-over':'')} onClick={onBin}
      onDragOver={event => { if (!busy && event.dataTransfer.types.includes(FILE_DRAG)) { event.preventDefault(); event.dataTransfer.dropEffect='move'; setOverBin(true) } }}
      onDragLeave={() => setOverBin(false)} onDrop={event => {
        event.preventDefault(); setOverBin(false)
        if (busy) return
        try {
          const ids: unknown = JSON.parse(event.dataTransfer.getData(FILE_DRAG))
          const known = new Set([...state.folders,...state.files,...(state.documents ?? [])].map(f=>f.id))
          if (Array.isArray(ids) && ids.length && ids.length<=100 && ids.every(id=>typeof id==='string' && known.has(id))) onTrash(ids)
        } catch { /* Ignore unrelated drops. */ }
      }}><TrashIcon size={18}/><span>Bin ({count})</span></button>
    <nav className="folder-navigation" aria-label="Browse folders">{navigationFolders(state,collapsed).map(({folder,path}) => {
      const children=state.folders.some(f=>f.parentId===folder.id)
      return <div key={folder.id} className="folder-tree-row" style={{paddingLeft:Math.min(path.length-1,8)*12}} draggable={!busy} onDragStart={e=>onDrag(e,folder.id)}>
        {children ? <button className="folder-disclosure" aria-label={(collapsed.has(folder.id)?'Expand ':'Collapse ')+folder.name} aria-expanded={!collapsed.has(folder.id)} onClick={()=>onCollapse(folder.id)}>{collapsed.has(folder.id)?'\u25b8':'\u25be'}</button> : <span className="folder-disclosure-space"/>}
        <button className={'folder-nav '+(!bin && folderId===folder.id?'is-active':'')} title={path.map(f=>f.name).join(' / ')} onClick={()=>onOpen(folder.id)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill={folder.color} fillOpacity=".16" stroke={folder.color} strokeWidth="1.6"/></svg><span>{folder.name}</span></button>
      </div>
    })}</nav>
  </aside>
}
