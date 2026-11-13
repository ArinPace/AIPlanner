import {useEffect,useRef,useState} from 'react'
import type {PDFDocumentProxy} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {PdfPage} from './PdfPreview'
import {CloseIcon} from './Icons'
import {loadRelayFile,shareRelayBlob} from '../lib/relayFiles'
import {nativeRequest} from '../lib/platform'
import {loadFiles,saveFiles,invalidateFilesCache} from '../lib/api'
import {folderPath,type FilesState} from '../lib/files'
import {officePreview,type OfficeSection} from '../lib/officePreview'

export function ChatFilePreview({id,onClose,allowSave=true}:{id:string;onClose:()=>void;allowSave?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null)
 const [file,setFile]=useState<{name:string;blob:Blob;url:string}>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [pdf,setPdf]=useState<PDFDocumentProxy>(),[page,setPage]=useState(1),[sections,setSections]=useState<OfficeSection[]>(),[text,setText]=useState('')
 const [destination,setDestination]=useState<'menu'|'files'|null>(null),[workspace,setWorkspace]=useState<FilesState>(),[folder,setFolder]=useState<string|null>(null),[notice,setNotice]=useState('')
 useEffect(()=>{dialog.current?.showModal()},[])
 useEffect(()=>{
  const controller=new AbortController();let stopped=false,url='',destroy:(()=>void)|undefined
  void loadRelayFile(id,controller.signal).then(async value=>{
   if(stopped)return;url=URL.createObjectURL(value.blob);setFile({...value,url})
   if(window.plannerNativeFilePreview){
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(value.blob)})
    if(stopped)return
    const result=await nativeRequest<{destination:string}>({action:'previewFile',name:value.name,data})
    if(stopped)return;if(result.destination==='files'&&allowSave)setDestination('files');else onClose();return
   }
   const bytes=new Uint8Array(await value.blob.arrayBuffer());if(stopped)return
   if(/\.pdf$/i.test(value.name)||value.blob.type==='application/pdf'){
    const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;const task=pdfjs.getDocument({data:bytes});destroy=()=>{void task.destroy()};const document=await task.promise;if(!stopped)setPdf(document)
   }else if(/\.(docx|xlsx|pptx)$/i.test(value.name)){const content=await officePreview(bytes,value.name);if(!content.length)throw Error('No preview content was found.');if(!stopped)setSections(content)}
   else if(/\.(txt|csv|md|json)$/i.test(value.name))setText(new TextDecoder().decode(bytes).slice(0,1000000))
  }).catch(e=>{if(!stopped)setError(e instanceof Error?e.message:'Could not open this file.')})
  return()=>{stopped=true;controller.abort();if(url)URL.revokeObjectURL(url);destroy?.()}
 },[id])
 useEffect(()=>{if(destination!=='files')return;let stopped=false;void loadFiles().then(value=>{if(!stopped)setWorkspace(value)}).catch(e=>{if(!stopped)setError(e.message)});return()=>{stopped=true}},[destination])
 async function save(){if(!file||!workspace||busy)return;setBusy(true);setError('');try{
  const fresh=await loadFiles(),existing=fresh.documents?.find(d=>d.kind==='attachment'&&d.chatFileId===id&&d.folderId===folder)
  if(!existing){const stem=file.name.replace(/[/\\\u0000-\u001f]/g,'_').slice(0,90).trim()||'Attachment';let name=stem,index=2;const taken=[...fresh.files,...fresh.documents||[]].filter(d=>d.folderId===folder).map(d=>d.name.toLowerCase());while(taken.includes(name.toLowerCase()))name=stem+' ('+index+++')'
   await saveFiles({...fresh,documents:[...fresh.documents||[],{id:crypto.randomUUID(),kind:'attachment',chatFileId:id,mime:file.blob.type||'application/octet-stream',size:file.blob.size,folderId:folder,name,updatedAt:new Date().toISOString()}]})
  }
  invalidateFilesCache();window.dispatchEvent(new Event('planner-files-refresh'));setNotice('Saved to Planner Files.');setDestination(null)
 }catch(e){setError(e instanceof Error?e.message:'Could not save this file.')}finally{setBusy(false)}}
 return <dialog ref={dialog} className="files-dialog content-preview chat-file-preview" aria-label={file?.name||'File preview'} onClose={onClose}>
  <header className="files-dialog-head"><h2>{file?.name||'Opening file…'}</h2><button type="button" className="text-btn" disabled={!file||busy} onClick={()=>setDestination(destination?null:'menu')}>Download</button><button type="button" className="icon-btn" aria-label="Close file preview" onClick={()=>dialog.current?.close()}><CloseIcon/></button></header>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {destination==='menu'&&<div className="attachment-destinations">{allowSave&&<button type="button" onClick={()=>setDestination('files')}>Save to Planner Files</button>}<button type="button" onClick={()=>{if(file)void shareRelayBlob(file.blob,file.name).catch(e=>setError(e.message))}}>Open in another app / Save to device</button></div>}
  {destination==='files'&&<div className="attachment-destinations"><label>Save in<select aria-label="Save attachment in folder" value={folder||''} onChange={e=>setFolder(e.target.value||null)}><option value="">Files</option>{workspace?.folders.map(f=><option key={f.id} value={f.id}>{folderPath(workspace.folders,f.id).map(p=>p.name).join(' / ')}</option>)}</select></label><button type="button" disabled={!workspace||busy} onClick={()=>void save()}>{busy?'Saving…':'Save to Files'}</button></div>}
  <div className="attachment-preview-body">{pdf?<><PdfPage pdf={pdf} pageNumber={page} width={1000}/><nav aria-label="PDF pages"><button type="button" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>{page} / {pdf.numPages}</span><button type="button" disabled={page===pdf.numPages} onClick={()=>setPage(page+1)}>Next</button></nav></>:sections?<><p className="quiet">Content preview</p>{sections.map((section,i)=><section key={i}><h3>{section.title}</h3>{section.paragraphs?.map((p,j)=><p key={j}>{p}</p>)}{section.rows&&<div className="attachment-sheet"><table><tbody>{section.rows.map((row,j)=><tr key={j}>{row.map((cell,k)=><td key={k}>{cell}</td>)}</tr>)}</tbody></table></div>}</section>)}</>:text?<pre>{text}</pre>:file?.blob.type.startsWith('image/')?<img alt={file.name} src={file.url}/>:!window.plannerNativeFilePreview&&file?<p>Preview is unavailable for this format. Use Download to save or open the original file.</p>:<p role="status">Opening local preview…</p>}</div>
 </dialog>
}
