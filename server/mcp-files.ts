import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {subscriptionFileAction,assertRelayFileReferences} from './subscription-files.js'
import {readFilesItemById,commitWorkspaceDelta} from './files-transfer.js'
import {filesWorkspaceLimit,validateFilesState,type FilesState,type PlannerDocument} from '../src/lib/files.js'
const id=z.string().min(1).max(100)
type Add=(name:string,description:string,schema:z.ZodRawShape,scope:string,readOnly:boolean,execute:(args:any)=>Promise<unknown>)=>void
async function workspace(username:string){return storage(await db().from('planner_files').select('state,revision').eq('username',username).single()) as {state:FilesState;revision:number}}
export async function startFileUpload(username:string,args:{name:string;mime:string;size:number}){
 const response=await subscriptionFileAction(username,{action:'file_start',...args})
 const value=await response.json() as {id:string;url:string}
 return {id:value.id,uploadUrl:value.url,method:'PUT',headers:{'Content-Type':args.mime},maximumBytes:25*1024*1024,next:'Upload the original bytes, then call planner_file_upload_finish with the current Files revision and destination. This ticket alone does not add a file to Files.'}
}
export async function finishFileUpload(username:string,args:{id:string;folderId:string|null;revision:number;replaceId?:string}){
 const row=await workspace(username)
 const prior=(row.state.documents??[]).find(d=>d.id===(args.replaceId||args.id))
 if(prior?.kind==='attachment'&&prior.chatFileId===args.id&&prior.folderId===args.folderId)return {saved:true,replayed:true,document:prior,revision:row.revision}
 if(row.revision!==args.revision)throw new ApiError(409,'Files changed. Read the current Files revision before registering this upload; do not upload the bytes again.')
 if(args.folderId&&!row.state.folders.some(f=>f.id===args.folderId))throw new ApiError(404,'Destination folder not found.')
 if(args.replaceId&&(!prior||prior.kind!=='attachment'))throw new ApiError(400,'Replacement requires an existing binary attachment ID. Notes use planner_update_item; PDFs use their existing import flow.')
 const response=await subscriptionFileAction(username,{action:'file_finish',id:args.id})
 const file=await response.json() as {id:string;name:string;mime:string;size:number}
 const document:PlannerDocument={id:prior?.id||file.id,folderId:args.folderId,name:prior?.name||file.name.slice(0,100),kind:'attachment',chatFileId:file.id,mime:file.mime,size:file.size,updatedAt:new Date().toISOString()}
 const state={...row.state,documents:[...(row.state.documents??[]).filter(d=>d.id!==document.id),document]}
 validateFilesState(state,filesWorkspaceLimit(username));await assertRelayFileReferences(username,[document])
 const saved=await commitWorkspaceDelta(username,row.revision,{upserts:{documents:[document]}})
 return {saved:true,document,revision:saved.revision,replaced:Boolean(args.replaceId)}
}
export async function downloadPlannerFile(username:string,fileId:string){
 const row=await readFilesItemById(username,fileId)
 if(row.section==='folders')throw new ApiError(400,'Choose a file, not a folder. Browse the folder and download its files individually.')
 if(row.section==='files'){
  const file=row.item as FilesState['files'][number]
  return {id:file.id,name:file.name+(file.format==='note'?'.md':/\.[a-z0-9]+$/i.test(file.name)?'':'.txt'),mime:file.format==='note'?'text/markdown':'text/plain',encoding:'utf-8',content:file.content,revision:row.revision}
 }
 const file=row.item as PlannerDocument
 if(file.kind==='link')return {id:file.id,name:file.name,url:file.url,kind:'link',downloaded:false,notice:'This is a saved external link, not stored file bytes.'}
 if(file.kind==='attachment'){
  const response=await subscriptionFileAction(username,{action:'file_download',id:file.chatFileId!})
  const value=await response.json() as {url:string;name:string}
  return {id:file.id,name:value.name,mime:file.mime,size:file.size,downloadUrl:value.url,expiresInSeconds:60,revision:row.revision}
 }
 const upload=storage(await db().from('planner_uploads').select('storage_path,status,size').eq('username',username).eq('id',file.id).maybeSingle())
 if(!upload||upload.status!=='complete'||upload.storage_path!==`${username}/${file.id}.pdf`)throw new ApiError(404,'PDF not available in this account.')
 const signed=await db().storage.from('planner-pdfs').createSignedUrl(upload.storage_path,60,{download:file.name})
 if(signed.error)throw new ApiError(502,'Could not prepare the PDF download.')
 return {id:file.id,name:file.name,mime:'application/pdf',size:file.size,downloadUrl:signed.data.signedUrl,expiresInSeconds:60,revision:row.revision}
}
export function registerMcpFileTools(add:Add,username:string){
 add('planner_file_download','Get original stored bytes for an owned Files attachment or PDF through a short-lived downloadUrl. Supports DOCX/XLSX/PPTX, images, ZIP/CSV and other binary uploads. Download promptly; use your file/code tools to inspect or edit the bytes. Notes return UTF-8 content; saved links return the external URL and are not claimed as downloads. Does not need Planner or a relay open. Never expose signed URLs beyond the user-requested transfer.',{id},'planner:read',true,({id})=>downloadPlannerFile(username,id))
 add('planner_file_upload_start','Prepare an account-private upload for any file type, maximum 25 MB per file. Provide the original filename, actual MIME and byte size. PUT original bytes to uploadUrl with returned headers, then finish registration. Upload files individually. No ChatGPT conversation or open Planner client is required. For PDFs up to 50 MB, the PDF-specific upload tools remain available.',{name:z.string().trim().min(1).max(240),mime:z.string().min(1).max(150).regex(/^[^\r\n]+$/),size:z.number().int().positive().max(25*1024*1024)},'planner:write',false,args=>startFileUpload(username,args))
 add('planner_file_upload_finish','Verify uploaded bytes and add the file to its destination in Files using the current revision. Retry the same id after a network failure: an already registered destination replays safely. Optional replaceId updates the bytes of an existing attachment while preserving its visible ID/name; all other files remain unchanged. On revision conflict reread and retry finish, not start. Read the result back with planner_read_file or planner_file_download.',{id:z.string().uuid(),folderId:id.nullable(),revision:z.number().int().nonnegative(),replaceId:id.optional()},'planner:write',false,args=>finishFileUpload(username,args))
}
