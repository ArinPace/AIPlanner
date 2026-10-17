import { randomUUID } from 'node:crypto'
import { ApiError, db, json, body, cleanupUploads } from './cloud.js'
import { storage } from './mcp-auth.js'
import { descendantIds, validateFilesState, type FilesState } from '../src/lib/files.js'
import { uuid } from './vm-validation.js'

export function selection(value:unknown) {
  if(!Array.isArray(value) || !value.length || value.length>100 || value.some(id=>typeof id!=='string' || !id || id.length>100))throw new ApiError(400,'Select between 1 and 100 items.')
  return [...new Set(value as string[])]
}
export function buildTrash(state:FilesState,ids:string[]) {
  const all=[...state.folders,...state.files,...(state.documents || [])]
  if(ids.some(id=>!all.some(item=>item.id===id)))throw new ApiError(409,'Some selected items changed. Refresh Files.')
  const folders=new Set<string>()
  for(const id of ids)if(state.folders.some(f=>f.id===id))for(const child of descendantIds(state.folders,id))folders.add(child)
  const snapshot:FilesState={folders:state.folders.filter(f=>folders.has(f.id)),files:state.files.filter(f=>ids.includes(f.id) || folders.has(f.folderId ?? '')),documents:(state.documents || []).filter(d=>ids.includes(d.id) || folders.has(d.folderId ?? ''))}
  const names=[...snapshot.folders.filter(f=>!f.parentId || !folders.has(f.parentId)),...snapshot.files.filter(f=>!folders.has(f.folderId ?? '')),...(snapshot.documents || []).filter(d=>!folders.has(d.folderId ?? ''))].map(f=>f.name)
  const removed=new Set([...snapshot.folders,...snapshot.files,...(snapshot.documents || [])].map(f=>f.id))
  return {state:{...state,folders:state.folders.filter(f=>!removed.has(f.id)),files:state.files.filter(f=>!removed.has(f.id)),documents:(state.documents || []).filter(f=>!removed.has(f.id))},entry:{names,snapshot,itemCount:removed.size}}
}
export function restoreFiles(current:FilesState,snapshots:FilesState[]) {
  const state=structuredClone(current),folders=snapshots.flatMap(s=>s.folders),files=snapshots.flatMap(s=>s.files),documents=snapshots.flatMap(s=>s.documents || [])
  const ids=new Set([...state.folders,...state.files,...(state.documents || [])].map(i=>i.id))
  for(const item of [...folders,...files,...documents]){if(ids.has(item.id))throw new ApiError(409,'An item with the same ID already exists. Restore would overwrite it.');ids.add(item.id)}
  const folderIds=new Set([...state.folders,...folders].map(f=>f.id))
  function unique(name:string,existing:string[]) {
    let candidate=name,n=1;const used=new Set(existing.map(s=>s.toLowerCase()))
    const ext=name.match(/\.(?:txt|pdf)$/i)?.[0] || '',base=ext?name.slice(0,-ext.length):name
    while(used.has(candidate.toLowerCase())){const suffix=` (restored ${n++})`;candidate=base.slice(0,100-suffix.length-ext.length)+suffix+ext}
    return candidate
  }
  for(const folder of folders){
    if(folder.parentId && !folderIds.has(folder.parentId))folder.parentId=null
    folder.name=unique(folder.name,state.folders.filter(f=>f.parentId===folder.parentId).map(f=>f.name))
    state.folders.push(folder)
  }
  let recovered:string|undefined
  for(const item of [...files,...documents]){
    if(item.folderId !== null && !folderIds.has(item.folderId)){
      if(!recovered){recovered=randomUUID();state.folders.push({id:recovered,parentId:null,name:unique('Restored files',state.folders.filter(f=>!f.parentId).map(f=>f.name)),color:'#1a73e8',labels:[],updatedAt:new Date().toISOString()});folderIds.add(recovered)}
      item.folderId=recovered
    }
    item.name=unique(item.name,[...state.files,...(state.documents || [])].filter(f=>f.folderId===item.folderId).map(f=>f.name))
    if('content' in item)state.files.push(item);else (state.documents ||= []).push(item)
  }
  validateFilesState(state)
  return state
}
async function commit(username:string,revision:number,state:FilesState,add:unknown=null,remove:string[]=[],restore=true){
  const {revision:_revision,...data}=state
  validateFilesState(data)
  const result=await db().rpc('planner_files_bin_commit',{p_username:username,p_revision:revision,p_state:data,p_add:add,p_remove:remove,p_restore:restore})
  if(result.error)throw new ApiError(result.error.code==='P0001'?409:503,result.error.code==='P0001'?result.error.message:'Could not update the Bin.')
  return {...data,revision:result.data.revision} as FilesState
}
export async function preserveRemovedFiles(username:string,next:FilesState,previous:FilesState){
  const keep=new Set([...next.folders,...next.files,...(next.documents || [])].map(i=>i.id))
  const ids=[...previous.folders,...previous.files,...(previous.documents || [])].filter(i=>!keep.has(i.id)).map(i=>i.id)
  if(!ids.length)return null
  const {entry}=buildTrash(previous,ids)
  entry.snapshot.folders=entry.snapshot.folders.filter(i=>!keep.has(i.id))
  entry.snapshot.files=entry.snapshot.files.filter(i=>!keep.has(i.id))
  entry.snapshot.documents=entry.snapshot.documents?.filter(i=>!keep.has(i.id))
  entry.itemCount=ids.length
  return commit(username,previous.revision!,next,entry)
}
export async function handleFilesBin(request:Request,path:string,username:string){
  if(request.method==='GET' && path==='/api/files/bin')return json({items:storage(await db().from('planner_file_bin').select('id,names,item_count,deleted_at,expires_at').eq('username',username).gt('expires_at',new Date().toISOString()).order('deleted_at',{ascending:false}).limit(1000))})
  if(request.method!=='POST')throw new ApiError(405,'Use POST.')
  const input=await body(request),ids=selection(input.ids)
  const row=storage(await db().from('planner_files').select('state,revision').eq('username',username).single())
  if(!Number.isSafeInteger(input.revision) || input.revision!==row.revision)throw new ApiError(409,'Files changed. Refresh before trying again.')
  if(path==='/api/files/trash'){
    const removed=buildTrash(row.state,ids)
    return json(await commit(username,row.revision,removed.state,removed.entry))
  }
  if(!['/api/files/restore','/api/files/purge'].includes(path))throw new ApiError(404,'Unknown Bin action.')
  if(ids.some(id=>!uuid(id)))throw new ApiError(400,'Choose valid Bin items.')
  const rows=storage(await db().from('planner_file_bin').select('id,snapshot').eq('username',username).in('id',ids).gt('expires_at',new Date().toISOString()))
  if(rows.length!==ids.length)throw new ApiError(404,'Some Bin items are unavailable or expired. Refresh the Bin.')
  const restore=path.endsWith('/restore'),next=restore?restoreFiles(row.state,rows.map(r=>r.snapshot)):row.state
  const saved=await commit(username,row.revision,next,null,ids,restore)
  if(!restore)await cleanupUploads(username)
  return json(saved)
}

export async function cleanupBinStorage(){
  const users=storage(await db().from('planner_uploads').select('username').eq('status','deleted').limit(100))
  for(const username of new Set(users.map(u=>u.username)))await cleanupUploads(username)
}
