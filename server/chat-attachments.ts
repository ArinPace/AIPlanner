import {ApiError} from './cloud.js'
import {uuid} from './vm-validation.js'
import {ATTACHMENT_COUNT,ATTACHMENT_LIMIT,type ChatAttachment} from '../src/lib/chatAttachments.js'
function binary(value:unknown,kind:'image'|'pdf'|'text'){
 if(typeof value!=='string' || value.length>ATTACHMENT_LIMIT*1.4)throw new ApiError(400,'Invalid attachment data.')
 const match=/^data:(image\/(?:png|jpeg|webp)|application\/pdf|text\/plain);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value)
 if(!match || !match[2])throw new ApiError(400,'Unsupported attachment encoding.')
 const data=Buffer.from(match[2],'base64'),mime=match[1]
 const valid=kind==='pdf'?mime==='application/pdf' && data.subarray(0,1024).includes(Buffer.from('%PDF-')):kind==='text'?mime==='text/plain' && !data.includes(0):mime==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?data[0]===255 && data[1]===216 && data[2]===255:mime==='image/webp' && data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP'
 if(!valid || !data.length)throw new ApiError(400,'Attachment contents do not match the file type.')
 return data.length
}
export function validateAttachments(value:unknown):ChatAttachment[]{
 if(value===undefined)return []
 if(!Array.isArray(value) || value.length>ATTACHMENT_COUNT)throw new ApiError(400,'Attach up to four files.')
 let total=0;const ids=new Set<string>()
 return value.map(a=>{
  if(!a || !uuid(a.id) || ids.has(a.id) || typeof a.name!=='string' || !a.name.trim() || a.name.length>160 || !['image','pdf','text'].includes(a.kind) || typeof a.coverage!=='string' || a.coverage.length>1000 || (a.text!==undefined && (typeof a.text!=='string' || a.text.length>50000)) || (a.images!==undefined && (!Array.isArray(a.images) || a.images.length>4)))throw new ApiError(400,'Invalid attachment metadata.')
  ids.add(a.id);const size=binary(a.data,a.kind);total+=size
  if(a.size!==size)throw new ApiError(400,'Attachment size does not match its contents.')
  const images=a.images?.map((image:unknown)=>{total+=binary(image,'image');return image as string})
  let thumbnail:string|undefined
  if(a.thumbnail!==undefined){if(binary(a.thumbnail,'image')>16000)throw new ApiError(400,'Attachment preview is too large.');thumbnail=a.thumbnail}
  if(total>ATTACHMENT_LIMIT)throw new ApiError(413,'Attachments and PDF previews must total no more than 2 MB. Try fewer or smaller files.')
  return {id:a.id,name:a.name.trim(),kind:a.kind,size,data:a.data,text:a.text,images,thumbnail,coverage:a.coverage}
 })
}
export function attachmentSummaries(items:ChatAttachment[]){return items.map(({data:_data,text:_text,images:_images,...metadata})=>metadata)}
