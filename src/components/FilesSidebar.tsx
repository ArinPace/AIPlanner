import { useState, type DragEvent, type ReactNode } from 'react'
import type { FilesState } from '../lib/files'
import { navigationFolders } from '../lib/fileActions'
import { CloseIcon, TrashIcon } from './Icons'
import {FileTypeIcon} from './FileTypeIcon'

export const FILE_DRAG = 'application/x-ai-planner-items'
export function FilesSidebar({ selectedItemId,state, folderId, bin, count, busy, collapsed, onCollapse, onOpen, onItem, onBin, addButton, onClose, onDrag, onTrash, onMove }: {
  selectedItemId?: string; state: FilesState; folderId: string | null; bin: boolean; count: number; busy: boolean
  collapsed: Set<string>; onCollapse: (id: string) => void
  onOpen: (id: string | null) => void; onBin: () => void; addButton: ReactNode; onClose: () => void
  onItem: (id: string) => void
  onDrag: (event: DragEvent, id: string) => void; onTrash: (ids: string[]) => void; onMove: (event: DragEvent, destination: string | null) => void
}) {
  const [overBin, setOverBin] = useState(false)
  function target(destination:string|null){return {onDragOver:(event:DragEvent)=>{if(!busy&&event.dataTransfer.types.includes(FILE_DRAG)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';event.currentTarget.classList.add('is-drag-over')}},onDragLeave:(event:DragEvent)=>event.currentTarget.classList.remove('is-drag-over'),onDrop:(event:DragEvent)=>{event.currentTarget.classList.remove('is-drag-over');onMove(event,destination)}}}
  const items=[...state.files,...(state.documents ?? [])].sort((a,b)=>a.name.localeCompare(b.name))
  function fileRow(item:typeof items[number],depth:number) {
    return <button key={item.id} type="button" className={'folder-nav sidebar-file '+(selectedItemId===item.id?'is-active':'')} aria-current={selectedItemId===item.id?'page':undefined} style={{paddingLeft:24+Math.min(depth,8)*12}} title={item.name} aria-label={'Open file '+item.name} draggable={!busy} onDragStart={e=>onDrag(e,item.id)} onClick={()=>onItem(item.id)}>{'content' in item?<FileTypeIcon note={item.format==='note'} size={18}/>:<svg width="18" height="20" viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="M4 2h8l5 5v15H4zM12 2v6h5" stroke="currentColor" strokeWidth="1.4"/></svg>}<span>{item.name}</span></button>
  }
  return <aside className="files-sidebar" aria-label="Folders">
    <div className="files-sidebar-heading"><button {...target(null)} className="text-btn files-root-button" aria-label="Open Files root" title="Show Files without opening a folder" onClick={() => onOpen(null)}>Files</button>{addButton}<button className="icon-btn" aria-label="Hide Files sidebar" onClick={onClose}><CloseIcon/></button></div>
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
    <nav className="folder-navigation" aria-label="Browse folders">{items.filter(item=>item.folderId===null).map(item=>fileRow(item,0))}{navigationFolders(state,collapsed).map(({folder,path}) => {
      const files=items.filter(item=>item.folderId===folder.id)
      const children=state.folders.some(f=>f.parentId===folder.id) || files.length>0
      return <div key={folder.id}><div {...target(folder.id)} className="folder-tree-row" style={{paddingLeft:Math.min(path.length-1,8)*12}} draggable={!busy} onDragStart={e=>onDrag(e,folder.id)}>
        {children ? <button className="folder-disclosure" aria-label={(collapsed.has(folder.id)?'Expand ':'Collapse ')+folder.name} aria-expanded={!collapsed.has(folder.id)} onClick={()=>onCollapse(folder.id)}>{collapsed.has(folder.id)?'\u25b8':'\u25be'}</button> : <span className="folder-disclosure-space"/>}
        <button className={'folder-nav '+(!bin && folderId===folder.id?'is-active':'')} title={path.map(f=>f.name).join(' / ')} onClick={()=>onOpen(folder.id)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill={folder.color} fillOpacity=".16" stroke={folder.color} strokeWidth="1.6"/></svg><span>{folder.name}</span></button>
      </div>{!collapsed.has(folder.id) && files.map(item=>fileRow(item,path.length))}</div>
    })}</nav>
  </aside>
}
