import {z} from 'zod'
import {createHash} from 'node:crypto'
import {filesWorkspaceLimit,type PlannerTextFile,type FilesState} from '../src/lib/files.js'
import type {FilesManifest,FilesSection,WorkspaceItem} from '../src/lib/filesTransfer.js'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
export function filesManifest(state:FilesState,username:string):FilesManifest{
 let inlineBytes=0
 return {format:'files-manifest',revision:state.revision||0,storageLimitBytes:filesWorkspaceLimit(username),items:(['folders','files','documents'] as const).flatMap(section=>(state[section]||[]).map((value,index)=>{
  const text=JSON.stringify(value),inline=section!=='files'&&Buffer.byteLength(text)<2048&&inlineBytes<512*1024
  if(inline)inlineBytes+=Buffer.byteLength(text)
  return {section,id:value.id,index,bytes:Buffer.byteLength(text),etag:createHash('md5').update(text).digest('hex'),...(inline?{value}: {})}
 }))}
}
export async function cloudFilesManifest(username:string):Promise<FilesManifest>{
 const data=storage(await db().rpc('planner_files_manifest',{p_username:username})) as FilesManifest|null
 if(!data)throw new ApiError(404,'Files not found.')
 return {...data,format:'files-manifest',storageLimitBytes:filesWorkspaceLimit(username)}
}
export async function readFilesTransferItem(username:string,url:URL){
 const section=url.searchParams.get('section') as FilesSection,index=Number(url.searchParams.get('index')),revision=Number(url.searchParams.get('revision')),id=url.searchParams.get('id')
 if(!['files','folders','documents'].includes(section)||!Number.isSafeInteger(index)||index<0||!Number.isSafeInteger(revision)||revision<0||!id)throw new ApiError(400,'Choose a valid file and revision.')
 const row=storage(await db().from('planner_files').select(`revision,item:state->${section}->${index}`).eq('username',username).eq('revision',revision).maybeSingle()) as {revision:number;item:WorkspaceItem}|null
 if(!row||row.item?.id!==id)throw new ApiError(409,'Files changed while loading. Retry with the latest index.')
 return row
}

// Agent reads need one item, not a multi-megabyte workspace per page/readback.
// Re-index once on a concurrent revision change; never return an item at a stale index.
export async function readFilesItemById(username:string,id:string){
 for(let attempt=0;attempt<2;attempt++){
  const manifest=await cloudFilesManifest(username)
  const entry=manifest.items.find(item=>item.id===id&&['files','documents'].includes(item.section))
  if(!entry)throw new ApiError(404,'File not found.')
  if(entry.value)return {revision:manifest.revision,section:entry.section,item:entry.value}
  const url=new URL('https://planner.internal/api/files/item')
  for(const [key,value] of Object.entries({section:entry.section,index:String(entry.index),revision:String(manifest.revision),id}))url.searchParams.set(key,value)
  try{return {...await readFilesTransferItem(username,url),section:entry.section}}catch(error){
   if(!(error instanceof ApiError)||error.status!==409||attempt===1)throw error
  }
 }
 throw new ApiError(409,'Files changed while loading. Retry with the latest index.')
}

export function singleFilePatch(patch:import('../src/lib/filesTransfer.js').FilesPatch,state:FilesState){
 if(patch.removeIds?.length||patch.upserts?.folders?.length||patch.upserts?.documents?.length||patch.upserts?.files?.length!==1)return null
 return state.files.find(file=>file.id===patch.upserts!.files![0].id)||null
}
export async function commitFileItem(username:string,revision:number,file:PlannerTextFile){
 const {data,error}=await db().rpc('planner_save_file_item',{p_username:username,p_revision:revision,p_item:file})
 if(error){console.error('File item commit failed',{code:error.code});throw new ApiError(error.code==='P0001'?409:503,error.code==='P0001'?'Files changed. Read the latest revision before saving.':'Could not save this file. Read it back before retrying.')}
 return data as {revision:number}
}

export function workspaceDelta(previous:FilesState,next:FilesState):import('../src/lib/filesTransfer.js').FilesPatch{
 const upserts:Partial<Record<import('../src/lib/filesTransfer.js').FilesSection,WorkspaceItem[]>>={},keep=new Set<string>()
 for(const section of ['folders','files','documents'] as const){
  const old=new Map((previous[section]||[]).map(item=>[item.id,JSON.stringify(item)]))
  const changed=(next[section]||[]).filter(item=>{keep.add(item.id);return old.get(item.id)!==JSON.stringify(item)})
  if(changed.length)upserts[section]=changed
 }
 return {upserts,removeIds:[...previous.folders,...previous.files,...(previous.documents||[])].filter(item=>!keep.has(item.id)).map(item=>item.id)}
}
export async function commitWorkspaceDelta(username:string,revision:number,patch:import('../src/lib/filesTransfer.js').FilesPatch,bin:{add?:unknown;remove?:string[];restore?:boolean}={}){
 const {data,error}=await db().rpc('planner_workspace_delta_commit',{p_username:username,p_revision:revision,p_upserts:patch.upserts||{},p_remove_ids:patch.removeIds||[],p_bin_add:bin.add??null,p_bin_remove:bin.remove||[],p_restore:bin.restore!==false})
 if(error){console.error('Workspace delta commit failed',{code:error.code});throw new ApiError(error.code==='P0001'?409:503,error.code==='P0001'?'Files or Bin changed. Read the latest revision before retrying.':'Could not commit this workspace change. Read current state before retrying.')}
 return data as {revision:number;binId?:string|null}
}

export async function readFilesBatch(username:string,input:unknown){
 const args=z.object({revision:z.number().int().nonnegative(),ids:z.array(z.string().min(1).max(200)).min(1).max(40)}).parse(input)
 if(new Set(args.ids).size!==args.ids.length)throw new ApiError(400,'Choose unique file IDs.')
 const result=await db().rpc('planner_files_batch',{p_username:username,p_revision:args.revision,p_ids:args.ids})
 if(result.error)throw new ApiError(result.error.code==='P0001'?409:400,result.error.code==='P0001'?'Files changed while loading. Please retry.':'Read fewer file items per batch.')
 return result.data
}

export async function readCanonicalNote(username:string,role:unknown){
 const key=z.enum(['todo','work']).parse(role),result=storage(await db().rpc('planner_canonical_note',{p_username:username,p_role:key}))
 if(!result)throw new ApiError(404,'Canonical note not found.')
 return {...result,storageLimitBytes:filesWorkspaceLimit(username)}
}
