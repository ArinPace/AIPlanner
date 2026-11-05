import {createHash} from 'node:crypto'
import {filesWorkspaceLimit,type FilesState} from '../src/lib/files.js'
import type {FilesManifest,FilesSection,WorkspaceItem} from '../src/lib/filesTransfer.js'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
export function filesManifest(state:FilesState,username:string):FilesManifest{
 let inlineBytes=0
 return {format:'files-manifest',revision:state.revision||0,storageLimitBytes:filesWorkspaceLimit(username),items:(['folders','files','documents'] as const).flatMap(section=>(state[section]||[]).map((value,index)=>{
  const text=JSON.stringify(value),inline=section!=='files'&&Buffer.byteLength(text)<2048&&inlineBytes<512*1024
  if(inline)inlineBytes+=Buffer.byteLength(text)
  return {section,id:value.id,index,etag:createHash('md5').update(text).digest('hex'),...(inline?{value}: {})}
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
