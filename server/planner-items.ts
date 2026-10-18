import {z} from 'zod'
import {ApiError} from './cloud.js'
import {patchPlannerNote} from './planner-notes.js'
import {validateFilesState,type FilesState} from '../src/lib/files.js'
const id=z.string().min(1).max(100)
export const plannerItemPatch={id,name:z.string().trim().min(1).max(100).optional(),folderId:id.nullable().optional(),parentId:id.nullable().optional(),color:z.string().regex(/^#[0-9a-f]{6}$/i).optional(),labels:z.array(z.string().trim().min(1).max(40)).max(10).optional(),content:z.string().max(1000000).optional(),format:z.enum(['note','text']).optional(),pinned:z.boolean().optional(),tags:z.array(z.string().min(1).max(40)).max(20).optional(),richText:z.string().max(1000000).optional(),url:z.string().url().max(4000).optional()}
export function patchWorkspaceItems(state:FilesState,patches:z.infer<z.ZodObject<typeof plannerItemPatch>>[]){
 if(new Set(patches.map(p=>p.id)).size!==patches.length)throw new ApiError(400,'Include each item only once in a bulk edit.')
 const next=structuredClone(state),items=[]
 for(const patch of patches){
  const folder=next.folders.find(f=>f.id===patch.id),note=next.files.find(f=>f.id===patch.id),document=next.documents?.find(f=>f.id===patch.id)
  const item=folder||note||document
  if(!item)throw new ApiError(404,'A selected item no longer exists. Read Files again.')
  const allowed=folder?['name','parentId','color','labels']:note?['name','folderId','content','format','pinned','tags','richText']:document?.kind==='link'?['name','folderId','url']:['name','folderId']
  for(const [key,value] of Object.entries(patch))if(key!=='id' && value!==undefined){
   if(!allowed.includes(key))throw new ApiError(400,'That field does not apply to this item type.')
   if(!note)(item as any)[key]=value
  }
  if(note){const {id:_id,...values}=patch;const changed=patchPlannerNote(note,values);for(const key of Object.keys(note))delete (note as any)[key];Object.assign(note,changed)}
  item.updatedAt=new Date().toISOString();items.push(item)
 }
 try{validateFilesState(next)}catch(e){throw new ApiError(400,e instanceof Error?e.message:'Invalid Files organization.')}
 return {state:next,items}
}
