import { PlannerDate as Date } from './timezone.js'
import { descendantIds, folderPath, validateFilesState, type FilesState } from './files.js'

export function moveItems(state: FilesState, ids: string[], destination: string | null): FilesState {
  const selected = new Set(ids)
  const folders = state.folders.filter(f => selected.has(f.id))
  const covered = new Set(folders.flatMap(f => [...descendantIds(state.folders, f.id)]))
  if (destination && (!state.folders.some(f => f.id === destination) || covered.has(destination))) throw new Error('Choose a destination outside the selected folders.')
  const insideSelection = (parent: string | null) => parent !== null && covered.has(parent)
  const updatedAt = new Date().toISOString()
  const next = {
    ...state,
    folders: state.folders.map(f => selected.has(f.id) && !insideSelection(f.parentId) ? { ...f, parentId: destination, updatedAt } : f),
    files: state.files.map(f => selected.has(f.id) && !insideSelection(f.folderId) ? { ...f, folderId: destination, updatedAt } : f),
    documents: state.documents?.map(f => selected.has(f.id) && !insideSelection(f.folderId) ? { ...f, folderId: destination, updatedAt } : f),
  }
  validateFilesState(next)
  return next
}

export function navigationFolders(state: FilesState, collapsed: Set<string>) {
  return state.folders.map(folder => ({ folder, path: folderPath(state.folders, folder.id) }))
    .filter(({ path }) => !path.slice(0, -1).some(f => collapsed.has(f.id)))
    .sort((a, b) => a.path.map(f => f.name).join('/').localeCompare(b.path.map(f => f.name).join('/')))
}
