import { useEffect, useRef, useState, type FormEvent } from 'react'
import { downloadPdf, loadFiles, saveFiles, uploadPdf } from '../lib/api'
import { TAG_COLORS } from '../lib/colors'
import { descendantIds, folderPath, validateFilesState, type FilesState, type PlannerFolder, type PlannerTextFile, type PlannerDocument } from '../lib/files'
import { CloseIcon, PlusIcon, TrashIcon } from './Icons'

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

export function FilesView({ onUnsavedChange }: { onUnsavedChange: (unsaved: boolean) => void }) {
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
  const saving = useRef(false)
  const storedFile = state?.files.find((file) => file.id === fileDraft?.id)
  const dirty = Boolean(fileDraft && (!storedFile || fileDraft.name !== storedFile.name || fileDraft.content !== storedFile.content || fileDraft.folderId !== storedFile.folderId))
  const unsaved = dirty || Boolean(folderDraft) || Boolean(documentDraft) || busy

  useEffect(() => { onUnsavedChange(unsaved) }, [unsaved, onUnsavedChange])
  useEffect(() => {
    if (!unsaved) return
    function onUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [unsaved])
  useEffect(() => {
    let active = true
    loadFiles().then((data) => { validateFilesState(data); if (active) setState(data) }).catch((err: unknown) => { if (active) setLoadError(err instanceof Error ? err.message : 'Could not load your files.') })
    return () => { active = false }
  }, [])

  async function persist(next: FilesState): Promise<boolean> {
    if (saving.current) return false
    setError('')
    setNotice('')
    try { validateFilesState(next) } catch (err) { setError(err instanceof Error ? err.message : 'Invalid files data.'); return false }
    saving.current = true
    setBusy(true)
    try {
      await saveFiles(next)
      setState(next)
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
    setFolderId(id); setFileDraft(null); setQuery(''); setLabelFilter(''); setError(''); setNotice('')
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
    if (!state || !fileDraft || busy || !window.confirm(`Delete “${fileDraft.name}”? This cannot be undone.`)) return
    if (await persist({ ...state, files: state.files.filter((file) => file.id !== fileDraft.id) })) setFileDraft(null)
  }
  async function deleteFolder(folder: PlannerFolder) {
    if (!state || busy) return
    const ids = descendantIds(state.folders, folder.id)
    const fileCount = state.files.filter((file) => ids.has(file.folderId)).length + (state.documents ?? []).filter((document) => ids.has(document.folderId)).length
    if (!window.confirm(`Delete “${folder.name}”, its ${ids.size - 1} subfolder(s), and ${fileCount} file(s) and link(s)? This cannot be undone.`)) return
    if (await persist({ folders: state.folders.filter((item) => !ids.has(item.id)), files: state.files.filter((file) => !ids.has(file.folderId)), documents: (state.documents ?? []).filter((document) => !ids.has(document.folderId)) })) {
      if (folderId && ids.has(folderId)) setFolderId(folder.parentId)
      if (fileDraft && ids.has(fileDraft.folderId)) setFileDraft(null)
    }
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
    if (!state || busy || !window.confirm(`Delete “${document.name}”? This cannot be undone.`)) return
    await persist({ ...state, documents: (state.documents ?? []).filter((item) => item.id !== document.id) })
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
  const searching = Boolean(search || labelFilter)
  const allLabels = [...new Set(state.folders.flatMap((folder) => folder.labels))].sort()
  const visibleFolders = state.folders.filter((folder) => (searching || folder.parentId === folderId) && (!search || `${folder.name} ${folder.labels.join(' ')}`.toLowerCase().includes(search)) && (!labelFilter || folder.labels.includes(labelFilter)))
  const visibleFiles = state.files.filter((file) => (searching || file.folderId === folderId) && (!search || `${file.name} ${file.content}`.toLowerCase().includes(search)) && (!labelFilter || state.folders.find((folder) => folder.id === file.folderId)?.labels.includes(labelFilter)))
  const visibleDocuments = (state.documents ?? []).filter((document) => (searching || document.folderId === folderId) && (!search || `${document.name} ${document.url ?? ''}`.toLowerCase().includes(search)) && (!labelFilter || state.folders.find((folder) => folder.id === document.folderId)?.labels.includes(labelFilter)))
  const compare = (a: { name: string; updatedAt: string }, b: { name: string; updatedAt: string }) => sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, undefined, { numeric: true })
  visibleFolders.sort(compare); visibleFiles.sort(compare); visibleDocuments.sort(compare)

  return <main className="files-workspace">
    <aside className="files-sidebar" aria-label="Folders">
      <div className="files-sidebar-heading"><h2>My folders</h2><button type="button" className="icon-btn" aria-label="New folder" disabled={busy} onClick={() => { setError(''); setFolderDraft({ id: crypto.randomUUID(), parentId: folderId, name: '', labels: [], color: TAG_COLORS[state.folders.length % TAG_COLORS.length], updatedAt: new Date().toISOString() }) }}><PlusIcon /></button></div>
      <button type="button" className={`folder-nav ${folderId === null ? 'is-active' : ''}`} onClick={() => openFolder(null)}><FolderIcon size={20} />All files</button>
      <nav className="folder-navigation" aria-label="Browse folders">{state.folders.map((folder) => ({ folder, path: folderPath(state.folders, folder.id) })).sort((a, b) => a.path.map((part) => part.name).join('/').localeCompare(b.path.map((part) => part.name).join('/'))).map(({ folder, path: parts }) => <button type="button" key={folder.id} className={`folder-nav ${folderId === folder.id ? 'is-active' : ''}`} style={{ paddingLeft: 12 + Math.min(parts.length - 1, 5) * 14 }} title={parts.map((part) => part.name).join(' / ')} onClick={() => openFolder(folder.id)}><FolderIcon color={folder.color} size={20} /><span>{folder.name}</span></button>)}</nav>
      {!state.folders.length && <p className="quiet files-sidebar-hint">Create a folder for your class notes, ideas, or plans.</p>}
      <p className="quiet files-sidebar-foot">{state.folders.length} folders · {state.files.length + (state.documents?.length ?? 0)} items</p>
    </aside>
    <section className="files-content" aria-label="File browser">
      <nav className="files-breadcrumbs" aria-label="Folder path"><button type="button" onClick={() => openFolder(null)}>All files</button>{path.map((folder) => <span key={folder.id}><span aria-hidden="true">/</span><button type="button" onClick={() => openFolder(folder.id)} aria-current={folder.id === folderId ? 'page' : undefined}>{folder.name}</button></span>)}</nav>
      <div className="files-title-row"><div className="files-heading">{currentFolder && <FolderIcon color={currentFolder.color} size={34} />}<div><h1>{currentFolder?.name ?? 'Files'}</h1><p className="quiet">{currentFolder ? 'Notes and documents, right where they belong.' : 'Notes, PDFs, and links, organized in one place.'}</p></div></div><div className="files-actions"><button type="button" className="today-btn" disabled={busy} onClick={() => { setError(''); setFolderDraft({ id: crypto.randomUUID(), parentId: folderId, name: '', labels: [], color: TAG_COLORS[state.folders.length % TAG_COLORS.length], updatedAt: new Date().toISOString() }) }}><PlusIcon size={16} />New folder</button><button type="button" className="primary-btn" disabled={!folderId || busy} title={!folderId ? 'Open a folder first to create a text file' : undefined} onClick={newFile}><PlusIcon size={16} />New text file</button><button type="button" className="today-btn" disabled={!folderId || busy} onClick={() => uploadRef.current?.click()}>Upload PDF</button><button type="button" className="today-btn" disabled={!folderId || busy} onClick={newLink}>Add link</button><input ref={uploadRef} className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="Upload PDF file" disabled={!folderId || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void addPdf(file); event.target.value = '' }} /></div></div>
      {currentFolder && <div className="folder-details">{currentFolder.labels.map((label) => <span className="file-label" key={label}>{label}</span>)}<button type="button" className="text-btn" disabled={busy} onClick={() => { setError(''); setFolderDraft(currentFolder) }}>Edit folder · labels · color · location</button><button type="button" className="danger-btn" disabled={busy} onClick={() => void deleteFolder(currentFolder)}><TrashIcon size={16} />Delete folder</button></div>}
      <div className="files-filters"><label className="files-search"><span className="sr-only">Search files and folders</span><input type="text" placeholder="Search names, labels, or text…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label><span className="sr-only">Filter by label</span><select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}><option value="">All labels</option>{allLabels.map((label) => <option key={label}>{label}</option>)}</select></label><label><span className="sr-only">Sort files and folders</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="updated">Recently updated</option></select></label></div>
      <div className="files-status" role="status">{busy ? 'Saving…' : dirty ? 'Unsaved text changes — click Save text file' : notice}</div>
      {error && !folderDraft && !documentDraft && <p role="alert" className="save-banner">{error}</p>}
      <div className={`files-panels ${fileDraft ? 'has-editor' : ''}`}>
        <div className="files-list">
          {searching && <p className="quiet files-result-count">{visibleFolders.length + visibleFiles.length + visibleDocuments.length} results across all folders</p>}
          {visibleFolders.map((folder) => <article key={folder.id} className="folder-card"><button type="button" className="folder-card-open" onClick={() => openFolder(folder.id)}><FolderIcon color={folder.color} size={36} /><div><strong>{folder.name}</strong><p className="quiet">{searching ? folderPath(state.folders, folder.parentId).map((part) => part.name).join(' / ') || 'All files' : `${state.folders.filter((item) => item.parentId === folder.id).length} folders · ${state.files.filter((file) => file.folderId === folder.id).length + (state.documents ?? []).filter((document) => document.folderId === folder.id).length} items`}</p><div className="file-labels">{folder.labels.map((label) => <span className="file-label" key={label}>{label}</span>)}</div></div></button><button type="button" className="text-btn" aria-label={`Edit folder ${folder.name}`} disabled={busy} onClick={() => { setError(''); setFolderDraft(folder) }}>Edit</button></article>)}
          {visibleFiles.map((file) => <button type="button" key={file.id} className={`text-file-row ${fileDraft?.id === file.id ? 'is-active' : ''}`} onClick={() => openFile(file)}><FileIcon /><div><strong>{file.name}</strong><p className="quiet">{searching ? folderPath(state.folders, file.folderId).map((part) => part.name).join(' / ') : new Date(file.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p><p className="file-preview">{file.content.slice(0, 120) || 'Empty text file'}</p></div></button>)}
          {visibleDocuments.map((document) => <article className="document-row" key={document.id}><div className="document-kind" aria-hidden="true">{document.kind === 'pdf' ? 'PDF' : '↗'}</div><div className="document-info"><strong>{document.name}</strong><p className="quiet">{document.kind === 'pdf' ? `${Math.max(1, Math.round((document.size ?? 0) / 1024)).toLocaleString()} KB · PDF document` : document.url}</p>{searching && <p className="quiet">{folderPath(state.folders, document.folderId).map((part) => part.name).join(' / ')}</p>}<div className="document-actions">{document.kind === 'link' ? <a href={document.url} target="_blank" rel="noopener noreferrer">Open link ↗</a> : <button type="button" className="text-btn accent-link" onClick={() => void getPdf(document)}>Download PDF</button>}<button type="button" className="text-btn" aria-label={`Edit ${document.name}`} disabled={busy} onClick={() => { setError(''); setDocumentDraft(document) }}>Edit / move</button><button type="button" className="danger-btn" aria-label={`Delete ${document.name}`} disabled={busy} onClick={() => void deleteDocument(document)}><TrashIcon size={14} /></button></div></div></article>)}
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
    {documentDraft && <DocumentDialog key={documentDraft.id} document={documentDraft} folders={state.folders} busy={busy} error={error} onClose={() => { setDocumentDraft(null); setError('') }} onSave={async (document) => { if (await persist({ ...state, documents: [...(state.documents ?? []).filter((item) => item.id !== document.id), document] })) setDocumentDraft(null) }} />}
    {folderDraft && <FolderDialog key={folderDraft.id} folder={folderDraft} folders={state.folders} busy={busy} error={error} onClose={() => { setFolderDraft(null); setError('') }} onSave={async (folder) => { if (await persist({ ...state, folders: [...state.folders.filter((item) => item.id !== folder.id), folder] })) setFolderDraft(null) }} />}
  </main>
}
