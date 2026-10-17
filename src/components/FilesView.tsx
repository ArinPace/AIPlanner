import { useEffect, useRef, useState, type FormEvent } from 'react'
import { downloadPdf, loadFiles, saveFiles, uploadPdf, loadFileBin, fileBinAction, type FileBinEntry } from '../lib/api'
import { TAG_COLORS } from '../lib/colors'
import { descendantIds, folderPath, validateFilesState, type FilesState, type PlannerFolder, type PlannerTextFile, type PlannerDocument } from '../lib/files'
import { CloseIcon, PlusIcon, TrashIcon } from './Icons'
import { RenameDialog } from './RenameDialog'
import { binDaysLeft } from '../lib/bin'

function FolderIcon({ color = '#1a73e8', size = 28 }: { color?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill={color} opacity=".16" /><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" stroke={color} strokeWidth="1.6" /></svg>
}

function FileIcon() {
  return <svg width="24" height="28" viewBox="0 0 24 28" fill="none" aria-hidden="true"><path d="M5 2h9l5 5v17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" /><path d="M14 2v6h5M7 13h8M7 17h8M7 21h5" stroke="currentColor" strokeWidth="1.5" /></svg>
}

function FolderSelect({ folders, value, onChange, exclude, allowRoot = true }: {
  folders: PlannerFolder[]; value: string | null; onChange: (value: string | null) => void; exclude?: Set<string>; allowRoot?: boolean
}) {
  return <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} required={!allowRoot}>
    {allowRoot ? <option value="">All files (top level)</option> : <option value="" disabled>Choose a folder</option>}
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
      <div className="files-dialog-head"><h2 id="document-dialog-title">{document.kind === 'link' ? 'Save web link' : 'Edit PDF'}</h2><button type="button" className="icon-btn" aria-label="Close document dialog" disabled={busy} onClick={onClose}><CloseIcon /></button></div>
      <fieldset className="files-fields" disabled={busy}>
        <label className="field"><span>{document.kind === 'link' ? 'Link title' : 'PDF name'}</span><input type="text" required autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder={document.kind === 'link' ? 'e.g. Course reading' : 'Document.pdf'} /></label>
        {document.kind === 'link' && <label className="field"><span>Web address</span><input type="url" required maxLength={4000} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" /></label>}
        <label className="field"><span>Folder · change to move this item</span><FolderSelect folders={folders} value={folderId} allowRoot={false} onChange={(id) => { if (id) setFolderId(id) }} /></label>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="files-dialog-actions"><button type="button" className="text-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : document.kind === 'link' ? 'Save link' : 'Save PDF'}</button></div>
    </form>
  </dialog>
}

export function FilesView({ active, onUnsavedChange }: { active: boolean; onUnsavedChange: (unsaved: boolean) => void }) {
  const [state, setState] = useState<FilesState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState<PlannerFolder | null>(null)
  const [fileDraft, setFileDraft] = useState<PlannerTextFile | null>(null)
  const [documentDraft, setDocumentDraft] = useState<PlannerDocument | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [sort, setSort] = useState('name')
  const [notice, setNotice] = useState('')
  const [bin,setBin]=useState(false)
  const [binItems,setBinItems]=useState<FileBinEntry[]>([])
  const [selecting,setSelecting]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [renameItem,setRenameItem]=useState<{id:string;name:string;kind:string}|null>(null)
  const saving = useRef(false)
  const storedFile = state?.files.find((file) => file.id === fileDraft?.id)
  const dirty = Boolean(fileDraft && (!storedFile || fileDraft.name !== storedFile.name || fileDraft.content !== storedFile.content || fileDraft.folderId !== storedFile.folderId))
  const unsaved = dirty || Boolean(folderDraft) || Boolean(documentDraft) || Boolean(renameItem) || busy

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
        const [data,deleted]=await Promise.all([loadFiles(),loadFileBin()]); validateFilesState(data)
        if (cancelled) return
        setState(current => current && current.revision !== undefined && current.revision === data.revision ? current : data)
        setFileDraft(current => current ? data.files.find(file => file.id === current.id) ?? null : null)
        setFolderId(current => current && data.folders.some(folder => folder.id === current) ? current : null)
        setLoadError('')
        setBinItems(deleted.items)
      } catch (err) { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your files.') }
      finally { refreshing = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [active, unsaved])

  async function persist(next: FilesState): Promise<boolean> {
    if (saving.current) return false
    setError('')
    setNotice('')
    try { validateFilesState(next) } catch (err) { setError(err instanceof Error ? err.message : 'Invalid files data.'); return false }
    saving.current = true
    setBusy(true)
    try {
      const saved = await saveFiles(next)
      setState({ ...next, revision: saved.revision ?? next.revision })
      setNotice('All changes saved')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      return false
    } finally { saving.current = false; setBusy(false) }
  }

  function mayLeaveEditor() {
    return !busy && (!dirty || window.confirm('Discard unsaved changes to this text file?'))
  }
  function openFolder(id: string | null) {
    if (!mayLeaveEditor()) return
    setBin(false);setSelectedIds([]);setSelecting(false);setFolderId(id); setFileDraft(null); setQuery(''); setLabelFilter(''); setError(''); setNotice('')
  }
  function openFile(file: PlannerTextFile) {
    if (!mayLeaveEditor()) return
    setFileDraft({ ...file }); setError(''); setNotice('')
  }
  function newFile() {
    if (!folderId || !mayLeaveEditor()) return
    setFileDraft({ id: crypto.randomUUID(), folderId, name: '', content: '', updatedAt: new Date().toISOString() }); setError(''); setNotice('')
  }
  async function saveFile(event: FormEvent) {
    event.preventDefault()
    if (!state || !fileDraft) return
    const file = { ...fileDraft, name: fileDraft.name.trim().replace(/\.txt$/i, '') + '.txt', updatedAt: new Date().toISOString() }
    if (!fileDraft.name.trim() || file.name === '.txt') { setError('Enter a file name.'); return }
    if (await persist({ ...state, files: [...state.files.filter((item) => item.id !== file.id), file] })) setFileDraft(file)
  }
  async function deleteFile() {
    if (!fileDraft)return
    await binAction('trash',[fileDraft.id])
  }
  async function deleteFolder(folder: PlannerFolder) {
    if (!state || busy) return
    await binAction('trash',[folder.id])
  }
  async function addPdf(file: File) {
    if (!folderId || saving.current) return
    if (file.size > 25 * 1024 * 1024) { setError('PDFs must be 25 MB or smaller.'); return }
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Choose a PDF file.'); return }
    saving.current = true; setBusy(true); setError(''); setNotice('')
    try { const next = await uploadPdf(folderId, file); validateFilesState(next); setState(next); setNotice('PDF uploaded and saved') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not upload PDF. Please try again.') }
    finally { saving.current = false; setBusy(false) }
  }
  async function deleteDocument(document: PlannerDocument) {
    await binAction('trash',[document.id])
  }
  async function binAction(action:'trash'|'restore'|'purge',ids:string[]){
    if(!state || busy || !ids.length || !mayLeaveEditor())return
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
  async function getPdf(document: PlannerDocument) {
    setError('')
    try { await downloadPdf(document.id, document.name) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not download PDF.') }
  }
  function newLink() {
    if (!folderId || busy) return
    setError(''); setDocumentDraft({ id: crypto.randomUUID(), name: '', kind: 'link', url: '', folderId, updatedAt: new Date().toISOString() })
  }
  function downloadFile() {
    if (!fileDraft) return
    const url = URL.createObjectURL(new Blob([fileDraft.content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = (fileDraft.name.trim() || 'Untitled.txt').replace(/[/\\]/g, '_')
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
    const text = values.join(' ').toLowerCase()
    return searchTerms.every((term) => text.includes(term))
  }
  const searching = Boolean(search || labelFilter)
  const allLabels = [...new Set(state.folders.flatMap((folder) => folder.labels))].sort()
  const visibleFolders = state.folders.filter((folder) => (searching || folder.parentId === folderId) && matchesSearch(paths.get(folder.id) ?? folder.name, folder.labels.join(' ')) && (!labelFilter || folder.labels.includes(labelFilter)))
  const visibleFiles = state.files.filter((file) => (searching || file.folderId === folderId) && matchesSearch(file.name, file.content, paths.get(file.folderId) ?? '') && (!labelFilter || state.folders.find((folder) => folder.id === file.folderId)?.labels.includes(labelFilter)))
  const visibleDocuments = (state.documents ?? []).filter((document) => (searching || document.folderId === folderId) && matchesSearch(document.name, document.url ?? '', paths.get(document.folderId) ?? '') && (!labelFilter || state.folders.find((folder) => folder.id === document.folderId)?.labels.includes(labelFilter)))
  const compare = (a: { name: string; updatedAt: string }, b: { name: string; updatedAt: string }) => sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, undefined, { numeric: true })
  visibleFolders.sort(compare); visibleFiles.sort(compare); visibleDocuments.sort(compare)

  function selectBox(item:{id:string;name:string}) {
    return <input type="checkbox" className="files-select-box" aria-label={'Select '+item.name} checked={selectedIds.includes(item.id)} disabled={busy || selectedIds.length>=100 && !selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>
  }
  if(bin)return <main className="files-workspace"><aside className="files-sidebar"><button className="folder-nav" onClick={()=>{setBin(false);setSelectedIds([])}}>Back to Files</button></aside><section className="files-content" aria-label="Files Bin"><button className="text-btn" onClick={()=>{setBin(false);setSelectedIds([])}}>Back to Files</button><h1>Bin</h1><p className="quiet">Deleted items are kept for 30 days, then permanently deleted. Items deleted together are restored together.</p><div className="files-bulk-toolbar"><label><input type="checkbox" aria-label="Select all Bin items" checked={binItems.length>0 && binItems.slice(0,100).every(i=>selectedIds.includes(i.id))} disabled={busy} onChange={e=>setSelectedIds(e.target.checked?binItems.slice(0,100).map(i=>i.id):[])}/>Select all (up to 100)</label><span>{selectedIds.length} selected</span><button className="today-btn" disabled={busy || !selectedIds.length} onClick={()=>void binAction('restore',selectedIds)}>Restore selected</button><button className="danger-btn" disabled={busy || !selectedIds.length} onClick={()=>void binAction('purge',selectedIds)}>Delete permanently</button></div>{error && <p role="alert" className="save-banner">{error}</p>}<p role="status">{busy?'Updating Bin...':notice}</p><div className="files-list">{binItems.map(item=><article className="document-row" key={item.id}>{selectBox({id:item.id,name:item.names.join(', ')})}<div className="document-info"><strong>{item.names.join(', ')}</strong><p className="quiet">{item.item_count} item(s) - Deleted {new Date(item.deleted_at).toLocaleString()} - {binDaysLeft(item.expires_at)} days left</p><button className="text-btn" disabled={busy} onClick={()=>void binAction('restore',[item.id])}>Restore</button></div></article>)}{!binItems.length && <p className="quiet">Bin is empty.</p>}</div></section></main>
  return <main className="files-workspace">
    <aside className="files-sidebar" aria-label="Folders">
      <div className="files-sidebar-heading"><h2>My folders</h2><button type="button" className="icon-btn" aria-label="New folder" disabled={busy} onClick={() => { setError(''); setFolderDraft({ id: crypto.randomUUID(), parentId: folderId, name: '', labels: [], color: TAG_COLORS[state.folders.length % TAG_COLORS.length], updatedAt: new Date().toISOString() }) }}><PlusIcon /></button></div>
      <button type="button" className={`folder-nav ${folderId === null ? 'is-active' : ''}`} onClick={() => openFolder(null)}><FolderIcon size={20} />All files</button>
      <button type="button" className="folder-nav" onClick={()=>{if(mayLeaveEditor()){setBin(true);setFileDraft(null);setSelectedIds([]);setError('');setNotice('')}}}><TrashIcon size={18}/>Bin ({binItems.reduce((n,i)=>n+i.item_count,0)})</button>
      <nav className="folder-navigation" aria-label="Browse folders">{state.folders.map((folder) => ({ folder, path: folderPath(state.folders, folder.id) })).sort((a, b) => a.path.map((part) => part.name).join('/').localeCompare(b.path.map((part) => part.name).join('/'))).map(({ folder, path: parts }) => <button type="button" key={folder.id} className={`folder-nav ${folderId === folder.id ? 'is-active' : ''}`} style={{ paddingLeft: 12 + Math.min(parts.length - 1, 5) * 14 }} title={parts.map((part) => part.name).join(' / ')} onClick={() => openFolder(folder.id)}><FolderIcon color={folder.color} size={20} /><span>{folder.name}</span></button>)}</nav>
      {!state.folders.length && <p className="quiet files-sidebar-hint">Create a folder for your class notes, ideas, or plans.</p>}
      <p className="quiet files-sidebar-foot">{state.folders.length} folders · {state.files.length + (state.documents?.length ?? 0)} items</p>
    </aside>
    <section className="files-content" aria-label="File browser">
      <nav className="files-breadcrumbs" aria-label="Folder path"><button type="button" onClick={() => openFolder(null)}>All files</button>{path.map((folder) => <span key={folder.id}><span aria-hidden="true">/</span><button type="button" onClick={() => openFolder(folder.id)} aria-current={folder.id === folderId ? 'page' : undefined}>{folder.name}</button></span>)}</nav>
      <div className="files-title-row"><div className="files-heading">{currentFolder && <FolderIcon color={currentFolder.color} size={34} />}<div><h1>{currentFolder?.name ?? 'Files'}</h1><p className="quiet">{currentFolder ? 'Notes and documents, right where they belong.' : 'Notes, PDFs, and links, organized in one place.'}</p></div></div><div className="files-actions"><button type="button" className="today-btn" aria-label="Open Files Bin" onClick={()=>{if(mayLeaveEditor()){setBin(true);setFileDraft(null);setSelectedIds([]);setError('');setNotice('')}}}>Bin</button><button type="button" className="today-btn" disabled={busy} onClick={() => { setError(''); setFolderDraft({ id: crypto.randomUUID(), parentId: folderId, name: '', labels: [], color: TAG_COLORS[state.folders.length % TAG_COLORS.length], updatedAt: new Date().toISOString() }) }}><PlusIcon size={16} />New folder</button><button type="button" className="primary-btn" disabled={!folderId || busy} title={!folderId ? 'Open a folder first to create a text file' : undefined} onClick={newFile}><PlusIcon size={16} />New text file</button><button type="button" className="today-btn" disabled={!folderId || busy} onClick={() => uploadRef.current?.click()}>Upload PDF</button><button type="button" className="today-btn" disabled={!folderId || busy} onClick={newLink}>Add link</button><input ref={uploadRef} className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="Upload PDF file" disabled={!folderId || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void addPdf(file); event.target.value = '' }} /></div></div>
      {currentFolder && <div className="folder-details">{currentFolder.labels.map((label) => <span className="file-label" key={label}>{label}</span>)}<button type="button" className="text-btn" disabled={busy} onClick={() => { setError(''); setFolderDraft(currentFolder) }}>Edit folder · labels · color · location</button><button type="button" className="danger-btn" disabled={busy} onClick={() => void deleteFolder(currentFolder)}><TrashIcon size={16} />Delete folder</button></div>}
      <div className="files-filters"><label className="files-search"><span className="sr-only">Search files and folders</span><input type="text" placeholder="Search all folders, files, links, or text…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span className="sr-only">Filter by label</span><select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}><option value="">All labels</option>{allLabels.map((label) => <option key={label}>{label}</option>)}</select></label><label><span className="sr-only">Sort files and folders</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="updated">Recently updated</option></select></label></div>
      <div className="files-bulk-toolbar"><button type="button" className="today-btn" disabled={busy} onClick={()=>{setSelecting(v=>!v);setSelectedIds([])}}>{selecting?'Cancel selection':'Select items'}</button>{selecting && <><label><input type="checkbox" aria-label="Select all visible files" disabled={busy} checked={[...visibleFolders,...visibleFiles,...visibleDocuments].length>0 && [...visibleFolders,...visibleFiles,...visibleDocuments].slice(0,100).every(i=>selectedIds.includes(i.id))} onChange={e=>setSelectedIds(e.target.checked?[...visibleFolders,...visibleFiles,...visibleDocuments].slice(0,100).map(i=>i.id):[])}/>Select all (up to 100)</label><span>{selectedIds.length} selected</span><button type="button" className="danger-btn" disabled={busy || !selectedIds.length} onClick={()=>void binAction('trash',selectedIds)}>Move selected to Bin</button></>}</div>
      <div className="files-status" role="status">{busy ? 'Saving…' : dirty ? 'Unsaved text changes — click Save text file' : notice}</div>
      {error && !folderDraft && !documentDraft && <p role="alert" className="save-banner">{error}</p>}
      <div className={`files-panels ${fileDraft ? 'has-editor' : ''}`}>
        <div className="files-list">
          {searching && <p className="quiet files-result-count">{visibleFolders.length + visibleFiles.length + visibleDocuments.length} results across all folders <button type="button" className="text-btn" onClick={() => { setQuery(''); setLabelFilter('') }}>Clear search</button></p>}
          {visibleFolders.map((folder) => <article key={folder.id} className="folder-card">{selecting && selectBox(folder)}<button type="button" className="folder-card-open" onClick={() => openFolder(folder.id)}><FolderIcon color={folder.color} size={36} /><div><strong>{folder.name}</strong><p className="quiet">{searching ? folderPath(state.folders, folder.parentId).map((part) => part.name).join(' / ') || 'All files' : `${state.folders.filter((item) => item.parentId === folder.id).length} folders · ${state.files.filter((file) => file.folderId === folder.id).length + (state.documents ?? []).filter((document) => document.folderId === folder.id).length} items`}</p><div className="file-labels">{folder.labels.map((label) => <span className="file-label" key={label}>{label}</span>)}</div></div></button><button type="button" className="text-btn" aria-label={`Edit folder ${folder.name}`} disabled={busy} onClick={() => { setError(''); setFolderDraft(folder) }}>Edit</button><button type="button" className="text-btn" aria-label={'Rename folder '+folder.name} disabled={busy} onClick={()=>{if(mayLeaveEditor()){setError('');setRenameItem({...folder,kind:'folder'})}}}>Rename</button></article>)}
          {visibleFiles.map((file) => <div key={file.id} className="files-selection-row">{selecting && selectBox(file)}<button type="button" className={`text-file-row ${fileDraft?.id === file.id ? 'is-active' : ''}`} onClick={() => openFile(file)}><FileIcon /><div><strong>{file.name}</strong><p className="quiet">{searching ? folderPath(state.folders, file.folderId).map((part) => part.name).join(' / ') : new Date(file.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p><p className="file-preview">{file.content.slice(0, 120) || 'Empty text file'}</p></div></button><button type="button" className="text-btn" aria-label={'Rename '+file.name} disabled={busy} onClick={()=>{if(mayLeaveEditor()){setError('');setRenameItem({...file,kind:'note'})}}}>Rename</button></div>)}
          {visibleDocuments.map((document) => <article className="document-row" key={document.id}>{selecting && selectBox(document)}<div className="document-kind" aria-hidden="true">{document.kind === 'pdf' ? 'PDF' : '↗'}</div><div className="document-info"><strong>{document.name}</strong><p className="quiet">{document.kind === 'pdf' ? `${Math.max(1, Math.round((document.size ?? 0) / 1024)).toLocaleString()} KB · PDF document` : document.url}</p>{searching && <p className="quiet">{folderPath(state.folders, document.folderId).map((part) => part.name).join(' / ')}</p>}<div className="document-actions">{document.kind === 'link' ? <a href={document.url} target="_blank" rel="noopener noreferrer">Open link ↗</a> : <button type="button" className="text-btn accent-link" onClick={() => void getPdf(document)}>Download PDF</button>}<button type="button" className="text-btn" aria-label={`Edit ${document.name}`} disabled={busy} onClick={() => { setError(''); setDocumentDraft(document) }}>Edit / move</button><button type="button" className="text-btn" aria-label={'Rename '+document.name} disabled={busy} onClick={()=>{if(mayLeaveEditor()){setError('');setRenameItem({...document,kind:document.kind})}}}>Rename</button><button type="button" className="danger-btn" aria-label={`Delete ${document.name}`} disabled={busy} onClick={() => void deleteDocument(document)}><TrashIcon size={14} /></button></div></div></article>)}
          {!visibleFolders.length && !visibleFiles.length && !visibleDocuments.length && <div className="files-empty"><FolderIcon color={currentFolder?.color} size={56} /><h2>{searching ? 'No matches found' : folderId ? 'Room for your next idea' : 'Start with a folder'}</h2><p className="quiet">{searching ? 'Try a different search or label.' : folderId ? 'Create a text file, upload a PDF, save a link, or add a subfolder.' : 'Add a folder, choose its color, and keep your notes, PDFs, and links inside.'}</p>{!searching && <button type="button" className="primary-btn" onClick={folderId ? newFile : () => { setError(''); setFolderDraft({ id: crypto.randomUUID(), parentId: null, name: '', labels: [], color: TAG_COLORS[0], updatedAt: new Date().toISOString() }) }}>{folderId ? 'Create text file' : 'Create your first folder'}</button>}</div>}
        </div>
        {fileDraft && <form className="text-editor" onSubmit={saveFile}>
          <div className="text-editor-head"><h2>{storedFile ? 'Edit text file' : 'New text file'}</h2><button type="button" className="icon-btn" aria-label="Close text editor" disabled={busy} onClick={() => { if (mayLeaveEditor()) setFileDraft(null) }}><CloseIcon /></button></div>
          <fieldset disabled={busy} className="files-fields">
            <label className="field"><span>File name</span><input type="text" required maxLength={96} placeholder="e.g. Lecture notes.txt" value={fileDraft.name} onChange={(event) => setFileDraft({ ...fileDraft, name: event.target.value })} /></label>
            <label className="field"><span>Folder · change to move this file</span><FolderSelect folders={state.folders} value={fileDraft.folderId} allowRoot={false} onChange={(id) => { if (id) setFileDraft({ ...fileDraft, folderId: id }) }} /></label>
            <label className="field text-content-field"><span>Text</span><textarea aria-label="Text file content" maxLength={1000000} placeholder="Write something worth keeping…" value={fileDraft.content} onChange={(event) => setFileDraft({ ...fileDraft, content: event.target.value })} /></label>
          </fieldset>
          <div className="text-editor-footer"><small className="quiet">{fileDraft.content.length.toLocaleString()} characters</small><div><button type="button" className="text-btn" onClick={downloadFile}>Download .txt</button>{storedFile && <button type="button" className="danger-btn" disabled={busy} onClick={() => void deleteFile()} aria-label="Delete text file"><TrashIcon size={16} /></button>}<button type="submit" className="primary-btn" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save text file'}</button></div></div>
        </form>}
      </div>
    </section>
    {renameItem && <RenameDialog key={renameItem.id} initialValue={renameItem.name} kind={renameItem.kind==='folder'?'folder':'file'} busy={busy} error={error} onClose={()=>{setRenameItem(null);setError('')}} onSave={async name=>{
      const extension=renameItem.kind==='note'?'.txt':renameItem.kind==='pdf'?'.pdf':''
      const newName=extension && !name.toLowerCase().endsWith(extension)?name+extension:name
      if(!name || newName.length>100){setError('Use a name between 1 and 100 characters including the file extension.');return}
      const rename=<T extends {id:string;name:string;updatedAt:string}>(item:T)=>item.id===renameItem.id?{...item,name:newName,updatedAt:new Date().toISOString()}:item
      if(await persist({...state,folders:state.folders.map(rename),files:state.files.map(rename),documents:(state.documents || []).map(rename)})){setFileDraft(null);setRenameItem(null);setNotice('Renamed and saved')}
    }}/>}
    {documentDraft && <DocumentDialog key={documentDraft.id} document={documentDraft} folders={state.folders} busy={busy} error={error} onClose={() => { setDocumentDraft(null); setError('') }} onSave={async (document) => { if (await persist({ ...state, documents: [...(state.documents ?? []).filter((item) => item.id !== document.id), document] })) setDocumentDraft(null) }} />}
    {folderDraft && <FolderDialog key={folderDraft.id} folder={folderDraft} folders={state.folders} busy={busy} error={error} onClose={() => { setFolderDraft(null); setError('') }} onSave={async (folder) => { if (await persist({ ...state, folders: [...state.folders.filter((item) => item.id !== folder.id), folder] })) setFolderDraft(null) }} />}
  </main>
}
