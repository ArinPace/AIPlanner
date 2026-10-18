import {useRef} from 'react'
import {getToken} from '../lib/api'
import type {AttachmentSummary} from '../lib/chatAttachments'
export function AttachButton({disabled,onFiles}:{disabled:boolean;onFiles:(files:File[])=>void}){
 const input=useRef<HTMLInputElement>(null)
 return <><input ref={input} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,.pdf,.txt,.md,.csv,.json,.log,.js,.ts,.tsx,.jsx,.py,.java,.html,.htm,.css,.xml,.yaml,.yml" onChange={e=>{onFiles(Array.from(e.target.files||[]));e.target.value=''}}/><button type="button" className="assistant-attach" aria-label="Add images or files" title="Add images or files (up to four, 2 MB total)" disabled={disabled} onClick={()=>input.current?.click()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 12 6-6a3 3 0 014 4L10 19a5 5 0 01-7-7L13 2M7 14l9-9"/></svg><span>Add files</span></button></>
}
export function ChatAttachments({items,onRemove,jobId,onError}:{items:AttachmentSummary[];onRemove?:(id:string)=>void;jobId?:string;onError?:(message:string)=>void}){
 async function download(item:AttachmentSummary){
  if(!jobId)return
  try{
   const r=await fetch(`/api/agent/vm/attachment?job=${encodeURIComponent(jobId)}&id=${encodeURIComponent(item.id)}`,{headers:{Authorization:'Bearer '+getToken()}})
   if(!r.ok)throw Error('Could not download this attachment.')
   const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
  }catch(e){onError?.(e instanceof Error?e.message:'Attachment download failed.')}
 }
 return <div className="chat-attachment-list">{items.map(item=><div className="chat-attachment" key={item.id}>
  {item.thumbnail?<img src={item.thumbnail} alt={item.name}/>:<span className="chat-attachment-icon" aria-hidden="true">▤</span>}
  <button type="button" className="chat-attachment-name" disabled={!jobId} onClick={()=>void download(item)} title={item.coverage}>{item.name}<small>{item.kind.toUpperCase()} · {(item.size/1024).toFixed(0)} KB{jobId?' · Download':''}</small></button>
  {onRemove && <button type="button" className="chat-attachment-remove" aria-label={'Remove attachment '+item.name} onClick={()=>onRemove(item.id)}>×</button>}
 </div>)}</div>
}
