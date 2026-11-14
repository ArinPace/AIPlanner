import {FolderChevron} from './FolderChevron'
import {prepareRelayFile,storeRelayFile,loadRelayFile,shareRelayBlob} from '../lib/relayFiles'
import {ChatFilePreview} from './ChatFilePreview'
import {PdfPreview, PdfThumbnail} from './PdfPreview'
import {openPlannerLink} from '../lib/linkPreference'
import { PlannerDate as Date } from '../lib/timezone.js'
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type DragEvent } from 'react'
import { loadCanonicalNote, loadFiles, peekFilesCache, warmFilesCache, saveFiles, downloadPdf, uploadPdf, loadFileBin, fileBinAction, type FileBinEntry } from '../lib/api'
import { TAG_COLORS } from '../lib/colors'
import { descendantIds, folderPath, validateFilesState, isVisiblePlannerFile, isPermanentPlannerNote, type FilesState, type PlannerFolder, type PlannerTextFile, type PlannerDocument } from '../lib/files'
import { CloseIcon, TrashIcon } from './Icons'
import { RenameDialog } from './RenameDialog'
import { FilesSidebar, FILE_DRAG } from './FilesSidebar'
import { BulkFilesDialog } from './BulkFilesDialog'
import { moveItems } from '../lib/fileActions'
import { MenuIcon } from './Icons'
import { binDaysLeft } from '../lib/bin'
import {FilesAddMenu} from './FilesAddMenu'
import {FileTypeIcon} from './FileTypeIcon'

const NotesWorkspace=lazy(()=>import('./NotesWorkspace').then(module=>({default:module.NotesWorkspace})))

function FolderIcon({ color = '#1a73e8', size = 28 }: { color?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill={color} opacity=".16" /><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" stroke={color} strokeWidth="1.6" /></svg>
}

function FolderSelect({ folders, value, onChange, exclude, allowRoot = true }: {
  folders: PlannerFolder[]; value: string | null; onChange: (value: string | null) => void; exclude?: Set<string>; allowRoot?: boolean
}) {
  return <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} required={!allowRoot}>
    {allowRoot ? <option value="">Files (no folder)</option> : <option value="" disabled>Choose a folder</option>}
    {folders.filter((folder) => !exclude?.has(folder.id)).map((folder) => ({ id: folder.id, path: folderPath(folders, folder.id).map((part) => part.name).join(' / ') })).sort((a, b) => a.path.localeCompare(b.path)).map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
  </select>
}

function FolderDialog({ folder, folders, busy, error, onClose, onSave }: {
  folder: PlannerFolder; folders: PlannerFolder[]; busy: boolean; error: string; onClose: () => void; onSave: (folder: PlannerFolder) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(folder.name)
  const [labels, setLabels] = useState(folder.labels.join(', '))
  const [color, setColor] = useState(folder.color)
  const [parentId, setParentId] = useState(folder.parentId)
  const existing = folders.some((item) => item.id === folder.id)
  useEffect(() => { ref.current?.showModal() }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    void onSave({ ...folder, name: name.trim(), parentId, color, labels: [...new Set(labels.split(',').map((label) => label.trim()).filter(Boolean))], updatedAt: new Date().toISOString() })
  }
  return <dialog ref={ref} className="files-dialog" aria-labelledby="folder-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <div className="files-dialog-head"><h2 id="folder-dialog-title">{existing ? 'Edit folder' : 'New folder'}</h2><button type="button" className="icon-btn" aria-label="Close folder dialog" disabled={busy} onClick={onClose}><CloseIcon /></button></div>
      <fieldset disabled={busy} className="files-fields">
        <label className="field"><span>Folder name</span><input type="text" autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Intro to CS" /></label>
        <label className="field"><span>Location</span><FolderSelect folders={folders} value={parentId} exclude={descendantIds(folders, folder.id)} onChange={setParentId} /></label>
        <label className="field"><span>Labels, separated by commas</span><input type="text" value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="e.g. School, Fall semester" /><small className="quiet">Up to 10 labels, 40 characters each.</small></label>
        <div className="field"><span>Folder color</span><div className="folder-colors" role="group" aria-label="Folder color">{TAG_COLORS.map((swatch) => <button type="button" key={swatch} className={`color-dot ${color === swatch ? 'is-selected' : ''}`} style={{ background: swatch }} aria-label={`Use color ${swatch}`} aria-pressed={color === swatch} onClick={() => setColor(swatch)} />)}<label className="custom-color">Custom<input type="color" aria-label="Custom folder color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div></div>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="files-dialog-actions"><button type="button" className="text-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save folder' : 'Create folder'}</button></div>
    </form>
  </dialog>
}

function DocumentDialog({ document, folders, busy, error, onClose, onSave }: {
  document: PlannerDocument; folders: PlannerFolder[]; busy: boolean; error: string; onClose: () => void; onSave: (document: PlannerDocument) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(document.name)
  const [url, setUrl] = useState(document.url ?? '')
  const [folderId, setFolderId] = useState(document.folderId)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className="files-dialog" aria-labelledby="document-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={(event) => { event.preventDefault(); void onSave({ ...document, name: name.trim(), url: document.kind === 'link' ? url.trim() : undefined, folderId, updatedAt: new Date().toISOString() }) }}>
      <div className="files-dialog-head"><h2 id="document-dialog-title">{document.kind === 'link' ? 'Save web link' : 'Edit document'}</h2><button type="button" className="icon-btn" aria-label="Close document dialog" disabled={busy} onClick={onClose}><CloseIcon /></button></div>
      <fieldset className="files-fields" disabled={busy}>
        <label className="field"><span>{document.kind === 'link' ? 'Link title' : 'File name'}</span><input type="text" required autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder={document.kind === 'link' ? 'e.g. Course reading' : 'Document.pdf'} /></label>
        {document.kind === 'link' && <label className="field"><span>Web address</span><input type="url" required maxLength={4000} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" /></label>}
        <label className="field"><span>Location (folder optional)</span><FolderSelect folders={folders} value={folderId} onChange={setFolderId} /></label>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="files-dialog-actions"><button type="button" className="text-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : document.kind === 'link' ? 'Save link' : 'Save file'}</button></div>
    </form>
  </dialog>
}

export function FilesView({ workMode = false, standaloneTodo = false, todoRequest = 0, active, username, sidebar, setSidebar, onUnsavedChange }: { workMode?: boolean; standaloneTodo?: boolean; todoRequest?: number; active: boolean; username: string; sidebar: boolean; setSidebar: (open:boolean)=>void; onUnsavedChange: (unsaved: boolean) => void }) {
  const [state, setState] = useState<FilesState | null>(()=>peekFilesCache())
  useEffect(()=>{let live=true;void warmFilesCache(username).then(data=>{if(live&&data)setState(current=>current??data)}).catch(()=>{});return()=>{live=false}},[username])
  useEffect(()=>{if(!active||!standaloneTodo||state)return;let live=true;void loadCanonicalNote(workMode?'work':'todo').then(data=>{if(live){validateFilesState(data,data.storageLimitBytes);setState(current=>current??data)}}).catch(()=>{});return()=>{live=false}},[username,active,standaloneTodo,workMode])
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState<PlannerFolder | null>(null)
  const [notesMode,setNotesMode]=useState(false)
  const [fileDraft, setFileDraft] = useState<PlannerTextFile | null>(null)
  const [preview, setPreview] = useState<PlannerDocument | null>(null)
  const [documentDraft, setDocumentDraft] = useState<PlannerDocument | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLElement>(null)
  const editorRef = useRef<HTMLDialogElement>(null)
  const editingFileId = notesMode?undefined:fileDraft?.id
  useEffect(()=>{
    const dialog=editorRef.current
    if(!dialog || !editingFileId)return
    if(!dialog.open)dialog.showModal()
    const field=dialog.querySelector<HTMLInputElement|HTMLTextAreaElement>(dialog.dataset.existing==='true'?'textarea':'input[type="text"]')
    field?.focus()
  },[editingFileId])
  const [query, setQuery] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [sort, setSort] = useState('name')
  const [notice, setNotice] = useState('')
  const [bin,setBin]=useState(false)
  useEffect(()=>{contentRef.current?.scrollTo({top:0})},[folderId,bin])
  const [binItems,setBinItems]=useState<FileBinEntry[]>([])
  const [selecting,setSelecting]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [renameItem,setRenameItem]=useState<{id:string;name:string;kind:string}|null>(null)
  const [expandedFolders,setExpandedFolders]=useState<Set<string>>(new Set())
  const collapsed=new Set((state?.folders ?? []).filter(folder=>!expandedFolders.has(folder.id)).map(folder=>folder.id))
  const [bulkMode,setBulkMode]=useState<'move'|'organize'|null>(null)
  const [layout,setLayout]=useState<'list'|'grid'>(()=>{try{return localStorage.getItem('ai-planner-files-layout:'+username)==='grid'?'grid':'list'}catch{return 'list'}})
  useEffect(()=>{try{localStorage.setItem('ai-planner-files-layout:'+username,layout)}catch{/* Layout still works when browser storage is unavailable. */}},[layout,username])
  const saving = useRef(false)
  const storedFile = state?.files.find((file) => file.id === fileDraft?.id)
  const dirty = Boolean(fileDraft && (!storedFile || fileDraft.name !== storedFile.name || fileDraft.content !== storedFile.content || fileDraft.folderId !== storedFile.folderId || fileDraft.richText!==storedFile.richText || Boolean(fileDraft.pinned)!==Boolean(storedFile.pinned)))
  const unsaved = dirty || Boolean(folderDraft) || Boolean(documentDraft) || Boolean(renameItem) || Boolean(bulkMode) || busy

  const handledTodoRequest=useRef(0)
  useEffect(()=>{
    if(!active || !state || !todoRequest || handledTodoRequest.current===todoRequest || busy)return
    handledTodoRequest.current=todoRequest
    const note=workMode ? state.files.find(file=>file.format==='note' && (file.systemRole==='work'||file.folderId===null&&file.name==='Work')) ?? {id:crypto.randomUUID(),folderId:null,format:'note' as const,name:'Work',content:'# Work\n\nUpcoming assignments, homework, tests and quizzes for the next three weeks.\n\nAwaiting the first agent review of your course materials and connected sources.',updatedAt:new Date().toISOString()} : state.files.find(file=>file.systemRole==='todo') ?? state.files.find(file=>file.format==='note' && /^to[ -]?do(?: list)?$/i.test(file.name.trim()))
    if(!note){setError('Your To-do note could not be found in Files.');return}
    if(fileDraft?.id!==note.id && dirty && !window.confirm('Discard unsaved changes?'))return
    setBin(false);setSelecting(false);setSelectedIds([]);setFolderId(note.folderId);setNotesMode(true)
    if(fileDraft?.id!==note.id)setFileDraft({...note})
    setError('');setNotice('')
    if(window.innerWidth<=600)setSidebar(false)
  },[active,state,todoRequest,busy,dirty,fileDraft,setSidebar,workMode])

  const saveNoteRef=useRef(saveFile)
  useEffect(()=>{saveNoteRef.current=saveFile})
  useEffect(()=>{if(!notesMode || !fileDraft?.name.trim() || !dirty || busy)return;const timer=window.setTimeout(()=>void saveNoteRef.current(),1200);return()=>window.clearTimeout(timer)},[notesMode,fileDraft,dirty,busy])

  useEffect(() => { onUnsavedChange(unsaved) }, [unsaved, onUnsavedChange])
  useEffect(() => {
    if (!unsaved) return
    function onUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [unsaved])
  useEffect(() => {
    if (!active || unsaved) return
    let cancelled = false, refreshing = false
    async function refresh() {
      if (refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        const data=await loadFiles({maxAge:30000}); validateFilesState(data,data.storageLimitBytes)
        if (cancelled) return
        setState(current => current && !current.partial && current.revision !== undefined && current.revision === data.revision ? current : data)
        setFileDraft(current => current ? data.files.find(file => file.id === current.id) ?? null : null)
        setFolderId(current => current && data.folders.some(folder => folder.id === current) ? current : null)
        setLoadError('')
        if(bin){const deleted=await loadFileBin();if(!cancelled)setBinItems(deleted.items)}
      } catch (err) { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your files.') }
      finally { refreshing = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60000)
    const resume=()=>{if(document.visibilityState==='visible')void refresh()}
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange',resume)
    window.addEventListener('planner-files-refresh',refresh)
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',resume);window.removeEventListener('planner-files-refresh',refresh)}
  }, [active, unsaved,bin])

  async function persist(next: FilesState): Promise<boolean> {
    if (saving.current) return false
    setError('')
    setNotice('')
    try { validateFilesState(next,next.storageLimitBytes) } catch (err) { setError(err instanceof Error ? err.message : 'Invalid files data.'); return false }
    saving.current = true
    setBusy(true)
    try {
      const saved = await saveFiles(next)
      setState({ ...next, revision: saved.revision ?? next.revision })
      setNotice(saved.planningSyncError || 'All changes saved')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      return false
    } finally { saving.current = false; setBusy(false) }
  }

  function mayLeaveEditor() {
    return !busy && (!dirty || window.confirm('Discard unsaved changes?'))
  }
  function openFolder(id: string | null) {
    if (!mayLeaveEditor()) return
    setBin(false);setSelectedIds([]);setSelecting(false);setFolderId(id); setNotesMode(false); setFileDraft(null); setQuery(''); setLabelFilter(''); setError(''); setNotice('')
  }
  function openFile(file: PlannerTextFile) {
    if (!mayLeaveEditor()) return
    setFolderId(file.folderId);setNotesMode(file.format==='note');setFileDraft({ ...file }); setError(''); setNotice('')
  }
  function newFile(note = false) {
    if (!mayLeaveEditor()) return
    setBin(false)
    if(window.innerWidth<=600)setSidebar(false)
    setNotesMode(note)
    let noteName='New Note',n=1;while(state?.files.some(f=>f.folderId===folderId && f.name.toLowerCase()===noteName.toLowerCase()))noteName='New Note '+(++n)
    setFileDraft({ id: crypto.randomUUID(), folderId, ...(note?{format:'note' as const}:{}), name: note?noteName:'', content: '', updatedAt: new Date().toISOString() }); setError(''); setNotice('')
  }
  async function saveFile(event?: FormEvent) {
    event?.preventDefault()
    if (!state || !fileDraft) return
    let base=state
    if(fileDraft.format==='note'){try{const latest=await loadFiles({maxAge:5000});const remote=latest.files.find(f=>f.id===fileDraft.id),before=state.files.find(f=>f.id===fileDraft.id);if(before && (!remote || remote.content!==before.content || remote.richText!==before.richText || remote.name!==before.name || remote.folderId!==before.folderId)){setError('This note changed elsewhere. Your local writing is preserved; copy it before reopening the latest version.');return}base=latest}catch(err){setError(err instanceof Error?err.message:'Could not load the latest notes.');return}}
    const file = { ...fileDraft,...(fileDraft.format==='note'?{tags:[...new Set([...fileDraft.content.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu)].map(m=>m[1]))].slice(0,20)}:{}), name: fileDraft.format==='note' ? fileDraft.name.trim() : fileDraft.name.trim().replace(/\.txt$/i, '') + '.txt', updatedAt: new Date().toISOString() }
    if (!fileDraft.name.trim() || file.name === '.txt') { setError('Enter a file name.'); return }
    if (await persist({ ...base, files: [...base.files.filter((item) => item.id !== file.id), file] })) setFileDraft(current=>current?.id===file.id && current.content===file.content && current.name===fileDraft.name && current.richText===file.richText?{...current,name:file.name,updatedAt:file.updatedAt,tags:file.tags}:current)
  }
  async function deleteFile() {
    if (!fileDraft)return
    if(isPermanentPlannerNote(fileDraft)){setError('Goals, To do and Work are permanent notes. You can edit their contents, but cannot delete them.');return}
    if (!storedFile) { setFileDraft(null); setError(''); return }
    await binAction('trash',[fileDraft.id])
  }
  async function deleteFolder(folder: PlannerFolder) {
    if (!state || busy) return
    await binAction('trash',[folder.id])
  }
  async function uploadFiles(files: File[]) {
    if(saving.current||!state)return
    saving.current=true;setBusy(true);setError('')
    let next=state, completed=0
    try {
      for(const file of files){
        setNotice(`Uploading ${completed+1} of ${files.length}: ${file.name}`)
        if(file.name.toLowerCase().endsWith('.pdf'))next=await uploadPdf(folderId,file)
        else {
          const prepared=await prepareRelayFile(file),id=await storeRelayFile(undefined,prepared)
          let name=file.name.slice(0,100),suffix=1
          while((next.documents??[]).some(item=>item.folderId===folderId&&item.name===name))name=file.name.slice(0,85)+` (${suffix++})`
          const updated={...next,documents:[...(next.documents??[]),{id:crypto.randomUUID(),folderId,name,kind:'attachment' as const,chatFileId:id,mime:prepared.mime,size:file.size,labels:[],updatedAt:new Date().toISOString()}]}
          validateFilesState(updated,updated.storageLimitBytes)
          const saved=await saveFiles(updated);next={...updated,revision:saved.revision??updated.revision}
        }
        setState(next);completed++
      }
      setNotice(`${completed} file${completed===1?'':'s'} uploaded and saved`)
    } catch(err){setError(`${completed} of ${files.length} uploaded. ${err instanceof Error?err.message:'Upload failed.'} Select the remaining files to retry.`)}
    finally{saving.current=false;setBusy(false)}
  }
  async function exportDocument(item:PlannerDocument){
    try{setError('');if(item.kind==='attachment'){const value=await loadRelayFile(item.chatFileId!);await shareRelayBlob(value.blob,value.name)}else if(item.kind==='pdf')await downloadPdf(item.id,item.name)}catch(err){if(!(err instanceof DOMException&&err.name==='AbortError'))setError(err instanceof Error?err.message:'Download failed.')}
  }
  async function deleteDocument(document: PlannerDocument) {
    await binAction('trash',[document.id])
  }
  async function binAction(action:'trash'|'restore'|'purge',ids:string[]){
    if(!state || busy || !ids.length || !mayLeaveEditor())return
    if(action==='trash'){
      const selectedFolders=new Set(ids.flatMap(id=>state.folders.some(f=>f.id===id)?[...descendantIds(state.folders,id)]:[]))
      if(state.files.some(file=>isPermanentPlannerNote(file)&&(ids.includes(file.id)||selectedFolders.has(file.folderId||'')))){setError('Goals, To do and Work cannot be deleted. Deselect them or move them out of the selected folder first.');return}
    }
    if(action==='trash' && !window.confirm(`Move ${ids.length} selected item(s) to the Bin? Selected folders include everything inside them. Restore them within 30 days.`))return
    if(action==='purge' && !window.confirm('Permanently delete the selected Bin items? This cannot be undone.'))return
    saving.current=true;setBusy(true);setError('')
    try{
      const saved=await fileBinAction(action,ids,state.revision!)
      setState(saved);setFileDraft(null);setSelectedIds([]);setSelecting(false)
      setFolderId(current=>saved.folders.some(f=>f.id===current)?current:null)
      setBinItems((await loadFileBin()).items)
      setNotice(action==='trash'?'Moved to Bin. You can restore these items for 30 days.':action==='restore'?'Items restored.':'Items permanently deleted.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update the Bin.')}
    finally{saving.current=false;setBusy(false)}
  }
  function openDocument(document: PlannerDocument) {
    if (document.kind === 'pdf'||document.kind==='attachment') setPreview(document)
    else if (document.url) openPlannerLink(document.url)
  }
  function newLink() {
    if (busy) return
    setError(''); setDocumentDraft({ id: crypto.randomUUID(), name: '', kind: 'link', url: '', folderId, updatedAt: new Date().toISOString() })
  }
  function downloadFile() {
    if (!fileDraft) return
    const url = URL.createObjectURL(new Blob([fileDraft.content], { type: fileDraft.format==='note'?'text/markdown;charset=utf-8':'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = (fileDraft.name.trim() || 'Untitled').replace(/[/\\]/g, '_')+(fileDraft.format==='note'?'.md':'')
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (!state) return <main className="files-loading">{loadError ? <><p role="alert" className="form-error">{loadError}</p><button type="button" className="primary-btn" onClick={() => { setLoadError(''); void loadFiles().then((data) => { validateFilesState(data); setState(data) }).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not load.')) }}>Retry</button></> : <p className="quiet">Opening your files…</p>}</main>
  const currentFolder = state.folders.find((folder) => folder.id === folderId)
  const path = folderPath(state.folders, folderId)
  const search = query.trim().toLowerCase()
  const searchTerms = search.split(/\s+/).filter(Boolean)
  const paths = new Map(state.folders.map((folder) => [folder.id, folderPath(state.folders, folder.id).map((part) => part.name).join(' / ')]))
  function matchesSearch(...values: string[]) {
    if(!searchTerms.length)return true
    const text = values.join(' ').toLowerCase()
    return searchTerms.every((term) => text.includes(term))
  }
  const searching = Boolean(search || labelFilter)
  const allLabels = [...new Set(state.folders.flatMap((folder) => folder.labels))].sort()
  const visibleFolders = state.folders.filter((folder) => (searching || folder.parentId === folderId) && matchesSearch(paths.get(folder.id) ?? folder.name, folder.labels.join(' ')) && (!labelFilter || folder.labels.includes(labelFilter)))
  const visibleFiles = state.files.filter((file) => isVisiblePlannerFile(file) && (searching || file.folderId === folderId) && matchesSearch(file.name, file.content, paths.get(file.folderId ?? '') ?? '') && (!labelFilter || state.folders.find((folder) => folder.id === file.folderId)?.labels.includes(labelFilter)))
  const visibleDocuments = (state.documents ?? []).filter((document) => (searching || document.folderId === folderId) && matchesSearch(document.name, document.url ?? '', paths.get(document.folderId ?? '') ?? '') && (!labelFilter || state.folders.find((folder) => folder.id === document.folderId)?.labels.includes(labelFilter)))
  const compare = (a: { name: string; updatedAt: string }, b: { name: string; updatedAt: string }) => sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, undefined, { numeric: true })
  visibleFolders.sort(compare); visibleFiles.sort(compare); visibleDocuments.sort(compare)

  function selectBox(item:{id:string;name:string}) {
    return <input type="checkbox" className="files-select-box" aria-label={'Select '+item.name} checked={selectedIds.includes(item.id)} disabled={busy || selectedIds.length>=100 && !selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>
  }
  function dragItem(event:DragEvent,id:string) {
    if(busy){event.preventDefault();return}
    event.dataTransfer.effectAllowed='move'
    event.dataTransfer.setData(FILE_DRAG,JSON.stringify(selectedIds.includes(id)?selectedIds:[id]))
  }
  async function dropInto(event:DragEvent,destination:string|null){
    if(!event.dataTransfer.types.includes(FILE_DRAG))return
    event.preventDefault();event.stopPropagation();event.currentTarget.classList.remove('is-drag-over')
    if(!state||busy||!mayLeaveEditor())return
    try{const ids:unknown=JSON.parse(event.dataTransfer.getData(FILE_DRAG));const known=new Set([...state.folders,...state.files,...(state.documents??[])].map(item=>item.id));if(!Array.isArray(ids)||!ids.length||ids.length>100||!ids.every(id=>typeof id==='string'&&known.has(id)))throw new Error('Invalid items to move.');if(await persist(moveItems(state,ids,destination))){setFileDraft(null);setSelectedIds([]);setNotice('Moved items')}}catch(error){setError(error instanceof Error?error.message:'Could not move items.')}
  }
  function folderDrop(destination:string){return {onDragOver:(event:DragEvent)=>{if(!busy&&event.dataTransfer.types.includes(FILE_DRAG)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';event.currentTarget.classList.add('is-drag-over')}},onDragLeave:(event:DragEvent)=>event.currentTarget.classList.remove('is-drag-over'),onDrop:(event:DragEvent)=>void dropInto(event,destination)}}
  function browse(id:string|null){openFolder(id);if(window.innerWidth<=600)setSidebar(false)}
  const addActions=[
    {label:'New note',run:()=>newFile(true)},
    {label:'New text file',run:()=>newFile()},
    {label:'New folder',run:()=>{setBin(false);setError('');setFolderDraft({id:crypto.randomUUID(),parentId:folderId,name:'',labels:[],color:TAG_COLORS[state.folders.length % TAG_COLORS.length],updatedAt:new Date().toISOString()})}},
    {label:'Upload files',run:()=>{if(!mayLeaveEditor())return;setBin(false);setNotesMode(false);setFileDraft(null);if(window.innerWidth<=600)setSidebar(false);uploadRef.current?.click()}},
    {label:'Add link',run:()=>{if(!mayLeaveEditor())return;setBin(false);setNotesMode(false);setFileDraft(null);if(window.innerWidth<=600)setSidebar(false);newLink()}},
  ]
  const pdfInput=<input ref={uploadRef} className="sr-only" type="file" multiple aria-label="Upload files" disabled={busy} onChange={event=>{const files=Array.from(event.target.files??[]);if(files.length)void uploadFiles(files);event.target.value=''}}/>
  const folderSidebar=<>{preview && active && (preview.kind==='attachment'?<ChatFilePreview key={preview.id} id={preview.chatFileId!} onClose={()=>setPreview(null)}/>:<PdfPreview key={preview.id} id={preview.id} name={preview.name} onClose={() => setPreview(null)} />)}{pdfInput}{sidebar && <FilesSidebar selectedItemId={fileDraft?.id} onItem={id=>{const note=state.files.find(f=>f.id===id);if(note)openFile(note);else {const doc=state.documents?.find(d=>d.id===id);if(doc)openDocument(doc)}if(window.innerWidth<=600)setSidebar(false)}} collapsed={collapsed} onCollapse={id=>setExpandedFolders(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})} state={state} folderId={folderId} bin={bin} count={binItems.length||bin?binItems.reduce((n,i)=>n+i.item_count,0):undefined} busy={busy} onOpen={browse} onBin={()=>{if(mayLeaveEditor()){setNotesMode(false);setBin(true);setFileDraft(null);setSelectedIds([]);setError('');setNotice('');if(window.innerWidth<=600)setSidebar(false)}}} onClose={()=>setSidebar(false)} addButton={<FilesAddMenu compact busy={busy} actions={addActions}/>} onDrag={dragItem} onMove={(event,destination)=>void dropInto(event,destination)} onTrash={ids=>void binAction('trash',ids)}/>}{sidebar && <button className="files-sidebar-scrim" aria-label="Close Files sidebar" onClick={()=>setSidebar(false)}/>}</>
  const showSidebar=!sidebar && <button type="button" className="today-btn files-sidebar-toggle" aria-label="Show Files sidebar" onClick={()=>setSidebar(true)}><MenuIcon/>Folders</button>
  if(bin)return <main className="files-workspace">{folderSidebar}<section ref={contentRef} className="files-content" aria-label="Files Bin">{showSidebar}<button className="text-btn" onClick={()=>{setBin(false);setSelectedIds([])}}>Back to Files</button><h1>Bin</h1><p className="quiet">Deleted items are kept for 30 days, then permanently deleted. Items deleted together are restored together.</p><div className="files-bulk-toolbar"><label><input type="checkbox" aria-label="Select all Bin items" checked={binItems.length>0 && binItems.slice(0,100).every(i=>selectedIds.includes(i.id))} disabled={busy} onChange={e=>setSelectedIds(e.target.checked?binItems.slice(0,100).map(i=>i.id):[])}/>Select all (up to 100)</label><span>{selectedIds.length} selected</span><button className="today-btn" disabled={busy || !selectedIds.length} onClick={()=>void binAction('restore',selectedIds)}>Restore selected</button><button className="danger-btn" disabled={busy || !selectedIds.length} onClick={()=>void binAction('purge',selectedIds)}>Delete permanently</button></div>{error && <p role="alert" className="save-banner">{error}</p>}<p role="status">{busy?'Updating Bin...':notice}</p><div className="files-list">{binItems.map(item=><article className="document-row" key={item.id}>{selectBox({id:item.id,name:item.names.join(', ')})}<div className="document-info"><strong>{item.names.join(', ')}</strong><p className="quiet">{item.item_count} item(s) - Deleted {new Date(item.deleted_at).toLocaleString()} - {binDaysLeft(item.expires_at)} days left</p><button className="text-btn" disabled={busy} onClick={()=>void binAction('restore',[item.id])}>Restore</button></div></article>)}{!binItems.length && <p className="quiet">Bin is empty.</p>}</div></section></main>
  const folderModal=folderDraft && <FolderDialog key={folderDraft.id} folder={folderDraft} folders={state.folders} busy={busy} error={error} onClose={() => { setFolderDraft(null); setError('') }} onSave={async (folder) => { if (await persist({ ...state, folders: [...state.folders.filter((item) => item.id !== folder.id), folder] })) setFolderDraft(null) }} />
  const notePane=(notesMode && (standaloneTodo || !fileDraft || isVisiblePlannerFile(fileDraft)))?<Suspense fallback={<p role="status">Opening Notes...</p>}><NotesWorkspace standalone={standaloneTodo} state={state} folderId={folderId} draft={fileDraft} busy={busy} dirty={dirty} error={error} notice={notice} onChange={setFileDraft} onSearch={search=>{if(standaloneTodo)return;if(mayLeaveEditor()){setNotesMode(false);setFileDraft(null);setQuery(search||'');requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('.files-search input')?.focus())}}} onNew={()=>newFile(true)} onDelete={()=>void deleteFile()} onSave={()=>void saveFile()} onClose={()=>{if(mayLeaveEditor()){setNotesMode(false);setFileDraft(null)}}} onMove={id=>{setFolderId(id);setFileDraft(current=>current?{...current,folderId:id}:null)}}/></Suspense>:null
  return <main className={"files-workspace"+(notePane?" unified-notes-workspace":"")}>
    {!standaloneTodo&&folderSidebar}
    {notePane}
    <section hidden={Boolean(notePane)} ref={contentRef} className="files-content" aria-label="File browser"><div className="files-view-toolbar">{showSidebar}<div className="files-layout-switch" role="group" aria-label="Files layout"><button type="button" aria-label="List view" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.7"/></svg>List</button><button type="button" aria-label="Grid view" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" stroke="currentColor" strokeWidth="1.5"/></svg>Grid</button></div></div>
      {path.length>0 && <nav className="files-breadcrumbs" aria-label="Folder path"><button type="button" onClick={() => openFolder(null)}>Files</button>{path.map((folder) => <span key={folder.id}><span aria-hidden="true">/</span><button type="button" onClick={() => openFolder(folder.id)} aria-current={folder.id === folderId ? 'page' : undefined}>{folder.name}</button></span>)}</nav>}
      <div className="files-title-row"><div className="files-heading">{currentFolder && <FolderIcon color={currentFolder.color} size={34} />}<div><h1>{currentFolder?.name ?? 'Files'}</h1><p className="quiet">{currentFolder ? 'Notes and documents, right where they belong.' : 'Documents, spreadsheets, slides, PDFs, and notes.'}</p></div></div><div className="files-actions"><button type="button" className="today-btn" disabled={busy} onClick={()=>{if(mayLeaveEditor())uploadRef.current?.click()}}>Upload files</button><FilesAddMenu busy={busy} actions={addActions}/></div></div>
      {currentFolder && <div className="folder-details">{currentFolder.labels.map((label) => <span className="file-label" key={label}>{label}</span>)}<button type="button" className="text-btn" disabled={busy} onClick={() => { setError(''); setFolderDraft(currentFolder) }}>Edit folder · labels · color · location</button><button type="button" className="danger-btn" disabled={busy} onClick={() => void deleteFolder(currentFolder)}><TrashIcon size={16} />Delete folder</button></div>}
      <div className="files-filters"><label className="files-search"><span className="sr-only">Search files and folders</span><input type="text" placeholder="Search all folders, files, links, or text…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span className="sr-only">Filter by label</span><select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}><option value="">All labels</option>{allLabels.map((label) => <option key={label}>{label}</option>)}</select></label><label><span className="sr-only">Sort files and folders</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="updated">Recently updated</option></select></label></div>
      <div className="files-bulk-toolbar"><button type="button" className="today-btn" disabled={busy} onClick={()=>{setSelecting(true);setSelectedIds([...visibleFolders,...visibleFiles,...visibleDocuments].slice(0,100).map(i=>i.id))}}>Select all</button><button type="button" className="today-btn" disabled={busy} onClick={()=>{setSelecting(v=>!v);setSelectedIds([])}}>{selecting?'Cancel selection':'Select items'}</button>{selecting && <><span>{selectedIds.length} selected</span><button type="button" className="today-btn" disabled={busy || !selectedIds.length} onClick={()=>{if(mayLeaveEditor()){setError('');setBulkMode('move')}}}>Move selected</button><button type="button" className="today-btn" disabled={busy || !state.folders.some(f=>selectedIds.includes(f.id))} onClick={()=>{if(mayLeaveEditor()){setError('');setBulkMode('organize')}}}>Labels and color</button><button type="button" className="danger-btn" disabled={busy || !selectedIds.length} onClick={()=>void binAction('trash',selectedIds)}>Move selected to Bin</button></>}</div>
      <div className="files-status" role="status">{busy ? notice.startsWith('Uploading ')?notice:'Saving…' : dirty ? 'Unsaved text changes — click Save text file' : notice}</div>
      {error && !folderDraft && !documentDraft && <p role="alert" className="save-banner">{error}</p>}
      <div className="files-panels">
        <div className={'files-list files-items-'+layout}>
          {searching && <p className="quiet files-result-count">{visibleFolders.length + visibleFiles.length + visibleDocuments.length} results across all folders <button type="button" className="text-btn" onClick={() => { setQuery(''); setLabelFilter('') }}>Clear search</button></p>}
          {visibleFolders.map((folder) => <article key={folder.id} className="folder-card" {...folderDrop(folder.id)} draggable={!busy} onDragStart={e=>dragItem(e,folder.id)}>{selecting && selectBox(folder)}<button type="button" className="folder-card-open" onClick={() => openFolder(folder.id)}><FolderChevron/><FolderIcon color={folder.color} size={36} /><div><strong>{folder.name}</strong><p className="quiet">{searching ? folderPath(state.folders, folder.parentId).map((part) => part.name).join(' / ') || 'All files' : `${state.folders.filter((item) => item.parentId === folder.id).length} folders · ${state.files.filter((file) => isVisiblePlannerFile(file) && file.folderId === folder.id).length + (state.documents ?? []).filter((document) => document.folderId === folder.id).length} items`}</p><div className="file-labels">{folder.labels.map((label) => <span className="file-label" key={label}>{label}</span>)}</div></div></button><button type="button" className="text-btn" aria-label={`Edit folder ${folder.name}`} disabled={busy} onClick={() => { setError(''); setFolderDraft(folder) }}>Edit</button><button type="button" className="text-btn" aria-label={'Rename folder '+folder.name} disabled={busy} onClick={()=>{if(mayLeaveEditor()){setError('');setRenameItem({...folder,kind:'folder'})}}}>Rename</button></article>)}
          {visibleFiles.map((file) => <div key={file.id} className="files-selection-row" draggable={!busy} onDragStart={e=>dragItem(e,file.id)}>{selecting && selectBox(file)}<button type="button" className={`text-file-row ${fileDraft?.id === file.id ? 'is-active' : ''}`} onClick={() => openFile(file)}><FileTypeIcon note={file.format==='note'}/><div><strong>{file.name}</strong><p className="quiet">{searching ? folderPath(state.folders, file.folderId).map((part) => part.name).join(' / ') : new Date(file.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p><p className="file-preview">{file.content.slice(0, 120) || 'Empty text file'}</p></div></button><button type="button" className="text-btn" aria-label={'Rename '+file.name} disabled={busy} onClick={()=>{if(mayLeaveEditor()){setError('');setRenameItem({...file,kind:file.format==='note'?'rich-note':'note'})}}}>Rename</button></div>)}
          {visibleDocuments.map((document) => <article className="document-row" key={document.id} draggable={!busy} onDragStart={e=>dragItem(e,document.id)}>{selecting && selectBox(document)}<button type="button" className="document-open-icon" aria-label={`Open ${document.name}`} onClick={() => openDocument(document)}>{document.kind === 'pdf' ? active ? <PdfThumbnail id={document.id} /> : <span className="document-kind" aria-hidden="true">PDF</span> : <span className="document-kind" aria-hidden="true">{document.kind==='attachment'?document.name.split('.').at(-1)?.toUpperCase():'↗'}</span>}</button><div className="document-info"><button type="button" className="document-open-name" onClick={() => openDocument(document)}>{document.name}</button><p className="quiet">{document.kind === 'pdf' ? `${Math.max(1, Math.round((document.size ?? 0) / 1024)).toLocaleString()} KB · PDF document` : document.kind==='attachment'?`${Math.max(1,Math.round((document.size??0)/1024))} KB · File`:document.url}</p>{searching && <p className="quiet">{folderPath(state.folders, document.folderId).map((part) => part.name).join(' / ')}</p>}<div className="document-actions">{document.kind!=='link'&&<button type="button" className="text-btn" disabled={busy} onClick={()=>void exportDocument(document)}>Download</button>}<button type="button" className="text-btn" aria-label={`Edit ${document.name}`} disabled={busy} onClick={() => { setError(''); setDocumentDraft(document) }}>Edit / move</button><button type="button" className="text-btn" aria-label={'Rename '+document.name} disabled={busy} onClick={()=>{if(mayLeaveEditor()){setError('');setRenameItem({...document,kind:document.kind})}}}>Rename</button><button type="button" className="danger-btn" aria-label={`Delete ${document.name}`} disabled={busy} onClick={() => void deleteDocument(document)}><TrashIcon size={14} /></button></div></div></article>)}
          {!visibleFolders.length && !visibleFiles.length && !visibleDocuments.length && <div className="files-empty"><FolderIcon color={currentFolder?.color} size={56} /><h2>{searching ? 'No matches found' : currentFolder ? 'No files in this folder' : 'Your files start here'}</h2><p className="quiet">{searching ? 'Try a different search or label.' : folderId ? 'Create a text file, upload files, save a link, or add a subfolder.' : 'Create a text file, upload files, save a link, or add a folder.'}</p></div>}
        </div>
        {fileDraft && <dialog ref={editorRef} className="files-dialog text-editor-dialog" data-existing={Boolean(storedFile)} aria-labelledby="text-editor-title" onCancel={event=>{event.preventDefault();if(mayLeaveEditor())setFileDraft(null)}}><form className="text-editor" onSubmit={saveFile}>
          <div className="text-editor-head"><h2 id="text-editor-title">{fileDraft.format==='note' ? (storedFile?'Edit note':'New note') : storedFile ? 'Edit text file' : 'New text file'}</h2><button type="button" className="icon-btn" aria-label="Close text editor" disabled={busy} onClick={() => { if (mayLeaveEditor()) setFileDraft(null) }}><CloseIcon /></button></div>
          <fieldset disabled={busy} className="files-fields">
            <label className="field"><span>File name</span><input type="text" required maxLength={96} placeholder="e.g. Lecture notes.txt" value={fileDraft.name} onChange={(event) => setFileDraft({ ...fileDraft, name: event.target.value })} /></label>
            <label className="field"><span>Location (folder optional)</span><FolderSelect folders={state.folders} value={fileDraft.folderId} onChange={(id) => setFileDraft({ ...fileDraft, folderId: id })} /></label>
            <label className="field text-content-field"><span>Text</span><textarea aria-label="Text file content" maxLength={1000000} placeholder="Write something worth keeping…" value={fileDraft.content} onChange={(event) => setFileDraft({ ...fileDraft, content: event.target.value })} /></label>
          </fieldset>
          <p className="files-status" role="status">{busy?'Saving...':dirty?'Unsaved changes':notice}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="text-editor-footer"><small className="quiet">{fileDraft.content.length.toLocaleString()} characters</small><div><button type="button" className="text-btn" onClick={downloadFile}>{fileDraft.format==='note'?'Download .md':'Download .txt'}</button>{storedFile && <button type="button" className="danger-btn" disabled={busy} onClick={() => void deleteFile()} aria-label="Delete text file"><TrashIcon size={16} /></button>}<button type="submit" className="primary-btn" disabled={busy || !dirty}>{busy ? 'Saving…' : fileDraft.format==='note'?'Save note':'Save text file'}</button></div></div>
        </form></dialog>}
      </div>
    </section>
    {bulkMode && <BulkFilesDialog state={state} ids={selectedIds} mode={bulkMode} busy={busy} error={error} onClose={()=>{setBulkMode(null);setError('')}} onSave={async(destination,color,labels)=>{
      try {
        const next=bulkMode==='move'?moveItems(state,selectedIds,destination):{...state,folders:state.folders.map(f=>selectedIds.includes(f.id)?{...f,color:color||f.color,labels:[...new Set([...f.labels,...labels.split(',').map(s=>s.trim()).filter(Boolean)])],updatedAt:new Date().toISOString()}:f)}
        if(await persist(next)){setBulkMode(null);setSelectedIds([]);setSelecting(false)}
      }catch(err){setError(err instanceof Error?err.message:'Could not update selected items.')}
    }}/>}
    {renameItem && <RenameDialog key={renameItem.id} initialValue={renameItem.name} kind={renameItem.kind==='folder'?'folder':'file'} busy={busy} error={error} onClose={()=>{setRenameItem(null);setError('')}} onSave={async name=>{
      const extension=renameItem.kind==='note'?'.txt':renameItem.kind==='pdf'?'.pdf':''
      const newName=extension && !name.toLowerCase().endsWith(extension)?name+extension:name
      if(!name || newName.length>100){setError('Use a name between 1 and 100 characters including the file extension.');return}
      const rename=<T extends {id:string;name:string;updatedAt:string}>(item:T)=>item.id===renameItem.id?{...item,name:newName,updatedAt:new Date().toISOString()}:item
      if(await persist({...state,folders:state.folders.map(rename),files:state.files.map(rename),documents:(state.documents || []).map(rename)})){setFileDraft(null);setRenameItem(null);setNotice('Renamed and saved')}
    }}/>}
    {documentDraft && <DocumentDialog key={documentDraft.id} document={documentDraft} folders={state.folders} busy={busy} error={error} onClose={() => { setDocumentDraft(null); setError('') }} onSave={async (document) => { if (await persist({ ...state, documents: [...(state.documents ?? []).filter((item) => item.id !== document.id), document] })) setDocumentDraft(null) }} />}
    {folderModal}
  </main>
}
