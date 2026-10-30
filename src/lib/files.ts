export interface PlannerFolder {
  id: string
  parentId: string | null
  name: string
  color: string
  labels: string[]
  updatedAt: string
}

export interface PlannerTextFile {
  systemRole?: 'goals'|'todo'
  format?: 'note'
  richText?: string
  richTextSource?: string
  pinned?: boolean
  tags?: string[]
  id: string
  folderId: string | null
  name: string
  content: string
  updatedAt: string
  agentSnapshot?: string
}

export interface FilesState {
  revision?: number
  folders: PlannerFolder[]
  files: PlannerTextFile[]
  documents?: PlannerDocument[]
}

export interface PlannerDocument {
  id: string
  folderId: string | null
  name: string
  kind: 'pdf' | 'link'
  url?: string
  size?: number
  updatedAt: string
}

export function folderPath(folders: PlannerFolder[], id: string | null): PlannerFolder[] {
  const path: PlannerFolder[] = []
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const folder = folders.find((item) => item.id === id)
    if (!folder) break
    path.unshift(folder)
    id = folder.parentId
  }
  return path
}

export function descendantIds(folders: PlannerFolder[], id: string): Set<string> {
  const ids = new Set([id])
  const queue = [id]
  for (let i = 0; i < queue.length; i++) {
    for (const folder of folders) {
      if (folder.parentId === queue[i] && !ids.has(folder.id)) {
        ids.add(folder.id)
        queue.push(folder.id)
      }
    }
  }
  return ids
}

// Both the UI and API validate the same hierarchy before saving it.
export function validateFilesState(value: unknown): asserts value is FilesState {
  if (!value || typeof value !== 'object') throw new Error('Invalid files data.')
  const state = value as FilesState
  if (new TextEncoder().encode(JSON.stringify(state)).length > 3 * 1024 * 1024) throw new Error('The Files workspace supports up to 3 MB of text and metadata. PDFs are stored separately.');
  if (!Array.isArray(state.folders) || !Array.isArray(state.files)) throw new Error('Invalid files data.')
  if (state.folders.length > 2000 || state.files.length > 5000) throw new Error('Too many folders or files.')
  const ids = new Set<string>()
  const names = new Set<string>()
  function checkItem(item: { id: string; name: string; updatedAt: string }, parent: string | null, kind: string) {
    if (typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) throw new Error('Invalid or duplicate item ID.')
    ids.add(item.id)
    if (typeof item.name !== 'string' || !item.name.trim() || item.name !== item.name.trim() || item.name.length > 100 || (/[/\\]/.test(item.name) || [...item.name].some((character) => character.charCodeAt(0) < 32))) {
      throw new Error('Names must be 1–100 characters without slashes or control characters.')
    }
    if (typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Invalid date.')
    const key = JSON.stringify([kind, parent, item.name.toLowerCase()])
    if (names.has(key)) throw new Error(`A ${kind} with that name already exists here.`)
    names.add(key)
  }
  for (const folder of state.folders) {
    if (!folder || typeof folder !== 'object') throw new Error('Invalid folder.')
    if (folder.parentId !== null && typeof folder.parentId !== 'string') throw new Error('Invalid parent folder.')
    checkItem(folder, folder.parentId, 'folder')
    if (typeof folder.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(folder.color)) throw new Error('Invalid folder color.')
    if (!Array.isArray(folder.labels) || folder.labels.length > 10 || folder.labels.some((label) => typeof label !== 'string' || !label.trim() || label.length > 40)) throw new Error('Use up to 10 labels, each 1–40 characters.')
  }
  const folderIds = new Set(state.folders.map((folder) => folder.id))
  for (const folder of state.folders) {
    if (folder.parentId && !folderIds.has(folder.parentId)) throw new Error('Parent folder does not exist.')
    const seen = new Set([folder.id])
    let parent = folder.parentId
    while (parent) {
      if (seen.has(parent)) throw new Error('A folder cannot be moved inside itself or its subfolders.')
      seen.add(parent)
      parent = state.folders.find((item) => item.id === parent)!.parentId
    }
  }
  for (const file of state.files) {
    if (!file || typeof file !== 'object') throw new Error('Invalid text file.')
    if (file.format !== undefined && file.format !== 'note') throw new Error('Invalid note format.')
    if(file.systemRole!==undefined&&(!['goals','todo'].includes(file.systemRole)||file.format!=='note'))throw new Error('Invalid permanent planning note.')
    if(file.pinned!==undefined && typeof file.pinned!=='boolean')throw new Error('Invalid pinned note.')
    if(file.tags!==undefined && (!Array.isArray(file.tags) || file.tags.length>20 || file.tags.some(t=>typeof t!=='string'||t.length>40)))throw new Error('Use up to 20 note tags, 40 characters each.')
    if(file.richText!==undefined){
      if(file.format!=='note' || typeof file.richText!=='string' || file.richText.length>1000000 || typeof file.richTextSource!=='string' || file.richTextSource.length>1000000)throw new Error('Invalid rich note.')
      let doc
      try{doc=JSON.parse(file.richText)}catch{throw new Error('Invalid note document.')}
      if(doc?.type!=='doc')throw new Error('Invalid note document.')
      const nodes=[{node:doc,depth:0}];let count=0
      while(nodes.length){const {node,depth}=nodes.pop()!;if(++count>20000 || depth>64 || !node || typeof node.type!=='string')throw new Error('This note is too complex. Split it into smaller notes.');if(node.type==='image' && !/^https?:\/\//i.test(node.attrs?.src || ''))throw new Error('Use a web URL for note images.');if(node.content){if(!Array.isArray(node.content))throw new Error('Invalid note content.');for(const child of node.content)nodes.push({node:child,depth:depth+1})}}
    }
    if (file.folderId !== null && (typeof file.folderId !== 'string' || !folderIds.has(file.folderId))) throw new Error('Choose Files or an existing folder for your file.')
    checkItem(file, file.folderId, 'file')
    if (typeof file.content !== 'string' || file.content.length > 1000000) throw new Error('Text files can contain up to 1 million characters.')
  }
  if (state.documents !== undefined && !Array.isArray(state.documents)) throw new Error('Invalid documents data.')
  if ((state.documents?.length ?? 0) > 5000) throw new Error('Too many documents.')
  for (const document of state.documents ?? []) {
    if (!document || typeof document !== 'object' || document.folderId !== null && !folderIds.has(document.folderId)) throw new Error('Choose Files or an existing folder for your document.')
    checkItem(document, document.folderId, 'file')
    if (document.kind === 'link') {
      let url: URL
      try { url = new URL(document.url ?? '') } catch { throw new Error('Enter a valid web link starting with https:// or http://.') }
      if (!['https:', 'http:'].includes(url.protocol) || document.url!.length > 4000 || url.username || url.password) throw new Error('Use a web link starting with https:// or http://, without embedded credentials.')
    } else if (document.kind === 'pdf') {
      if (!/^[0-9a-f-]{36}$/.test(document.id) || !Number.isInteger(document.size) || document.size! < 1 || document.size! > 25 * 1024 * 1024) throw new Error('Invalid PDF document.')
    } else throw new Error('Unsupported document type.')
  }
}

// Keep the saved instruction snapshot available to agents without listing it in Files.
export function isVisiblePlannerFile(file:{name:string;systemRole?:string;folderId?:string|null}){return !(file.name==='Work' && file.folderId===null) && file.systemRole!=='todo' && !/^to[ -]?do(?: list)?$/i.test(file.name.trim()) && file.name.trim().toLowerCase()!=='system prompt.txt'}

export function isPermanentPlannerNote(file:{name:string;systemRole?:string;folderId?:string|null}){return Boolean(file.systemRole) || (file.name==='Work' && file.folderId===null)}
