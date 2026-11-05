import type {FilesState,PlannerTextFile,PlannerFolder,PlannerDocument} from './files.js'
export type FilesSection='files'|'folders'|'documents'
export type WorkspaceItem=PlannerTextFile|PlannerFolder|PlannerDocument
export type FilesManifest={format:'files-manifest';revision:number;storageLimitBytes:number;items:{section:FilesSection;id:string;index:number;etag:string;bytes?:number;value?:WorkspaceItem}[]}
export type FilesPatch={revision?:number;upserts?:Partial<Record<FilesSection,WorkspaceItem[]>>;removeIds?:string[]}
export function applyFilesPatch(previous:FilesState,patch:FilesPatch):FilesState {
 if(!patch||typeof patch!=='object'||(patch.upserts!==undefined&&(!patch.upserts||typeof patch.upserts!=='object'||Object.keys(patch.upserts).some(key=>!['files','folders','documents'].includes(key))))|| (patch.removeIds!==undefined&&(!Array.isArray(patch.removeIds)||patch.removeIds.some(id=>typeof id!=='string'))))throw new Error('Invalid Files patch.')
 const removed=new Set(patch.removeIds||[]),next={...previous,revision:patch.revision}
 for(const section of ['folders','files','documents'] as const){
  const replacements=patch.upserts?.[section]||[]
  if(!Array.isArray(replacements)||replacements.some(item=>!item||typeof item!=='object'||typeof item.id!=='string')||new Set(replacements.map(item=>item.id)).size!==replacements.length)throw new Error('Invalid Files patch items.')
  const byId=new Map(replacements.map(item=>[item.id,item]))
  const items=(previous[section]||[]).filter(item=>!removed.has(item.id)).map(item=>{const replacement=byId.get(item.id);byId.delete(item.id);return replacement||item})
  items.push(...byId.values());Object.assign(next,{[section]:items})
 }
 return next
}
/** Metadata first creates destinations; removals happen after their children move. */
export function filesPatches(previous:FilesState,next:FilesState):FilesPatch[]{
 const changed=(section:FilesSection)=>(next[section]||[]).filter(item=>JSON.stringify((previous[section]||[]).find(old=>old.id===item.id))!==JSON.stringify(item))
 const patches:FilesPatch[]=[]
 const folders=changed('folders');if(folders.length)patches.push({upserts:{folders}})
 for(const file of changed('files'))patches.push({upserts:{files:[file]}})
 const documents=changed('documents');if(documents.length)patches.push({upserts:{documents}})
 const keep=new Set([...next.folders,...next.files,...(next.documents||[])].map(item=>item.id))
 const removeIds=[...previous.folders,...previous.files,...(previous.documents||[])].filter(item=>!keep.has(item.id)).map(item=>item.id)
 if(removeIds.length)patches.push({removeIds})
 return patches
}
