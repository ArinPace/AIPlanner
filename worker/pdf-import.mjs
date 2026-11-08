import {readFile,stat} from 'node:fs/promises'
import path from 'node:path'
import {workspaceFile,publicBrowserUrl} from './browser-control.mjs'
import {createHash} from 'node:crypto'
import {readableUrl} from './browser-access.mjs'
const MAX=50*1024*1024
export async function pdfWorkerCall(origin,credentials,action,input,request=fetch){
 const response=await request(new URL('/api/agent/vm/worker/pdf-upload/'+action,origin),{method:'POST',headers:{Authorization:'Bearer '+credentials.token,'Content-Type':'application/json','X-Planner-Job':credentials.jobId||'','X-Planner-Lease':credentials.lease||''},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)})
 // This is a Fetch Response, not a Playwright APIResponse.
 if(!response.ok)throw Error('PDF save failed ('+response.status+'). Check the active run and Files state; do not claim a saved PDF.')
 return response.json()
}
export function pdfDestination(value,enabled,sources){
 const u=new URL(value)
 if(enabled.includes('drive')&&u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(u.hostname==='drive.usercontent.google.com'||u.hostname.endsWith('.googleusercontent.com')))return u.href
 return readableUrl(value,enabled,sources)
}
export async function downloadPdf(context,href,{enabled,sources,sourcePageUrl}){
 let observedOrigin=null
 let url
 try{url=readableUrl(href,enabled,sources)}catch(error){
  if(!sourcePageUrl)throw error
  const source=readableUrl(sourcePageUrl,enabled,sources),target=publicBrowserUrl(href)
  // The caller must identify a real open enabled page exposing this exact link.
  let observed=false
  for(const page of context.pages())if(page.url()===source&&await page.locator('a[href]').evaluateAll((nodes,target)=>nodes.some(n=>n.href===target),target)){observed=true;break}
  if(!observed)throw Error('The PDF link was not observed on the specified enabled source page.')
  url=target;observedOrigin=new URL(target).origin
 }
 const original=new URL(url)
 const topic=original.hostname==='brightspace.nyu.edu'&&original.pathname.match(/^\/d2l\/le\/content\/(\d+)\/viewContent\/(\d+)/i)
 if(topic){
  const response=await context.request.get(original.origin+'/d2l/api/le/1.82/'+topic[1]+'/content/topics/'+topic[2],{timeout:20000,maxRedirects:0})
  try{if(response.ok()&&/json/i.test(response.headers()['content-type']||'')){const metadata=await response.json();if(metadata.Url)url=readableUrl(new URL(metadata.Url,original.origin).href,enabled,sources)}}finally{await response.dispose()}
 }
 const u=new URL(url),doc=u.hostname==='docs.google.com'&&u.pathname.match(/^\/(document|presentation|spreadsheets)\/(?:u\/\d+\/)?d\/([\w-]+)/)
 if(doc&&enabled.includes('drive')){const exportUrl=new URL('/'+doc[1]+'/d/'+doc[2]+'/export',u.origin);exportUrl.searchParams.set('format','pdf');if(u.searchParams.has('authuser'))exportUrl.searchParams.set('authuser',u.searchParams.get('authuser'));else{const account=u.pathname.match(/^\/(?:document|presentation|spreadsheets)\/u\/(\d+)\/d\//)?.[1];if(account!==undefined)exportUrl.searchParams.set('authuser',account)}url=exportUrl.href}
 const drive=u.hostname==='drive.google.com'&&u.pathname.match(/^\/file\/d\/([\w-]+)/)
 if(drive&&enabled.includes('drive'))url='https://drive.google.com/uc?export=download&id='+drive[1]
 for(let redirects=0;redirects<6;redirects++){
  if(observedOrigin&&new URL(publicBrowserUrl(url)).origin===observedOrigin){}else url=pdfDestination(url,enabled,sources)
  const response=await context.request.get(url,{timeout:30000,maxRedirects:0}).catch(()=>{throw Error('PDF source request failed. Check source access and the original download URL.')})
  try{
   if([301,302,303,307,308].includes(response.status())){if(!response.headers().location)throw Error('PDF redirect has no destination.');url=new URL(response.headers().location,url).href;continue}
   if(!response.ok())throw Error('PDF download failed ('+response.status()+'). Recheck source access.')
   if(Number(response.headers()['content-length']||0)>MAX)throw Error('PDF exceeds the 50 MB limit.')
   const bytes=await response.body()
   if(bytes.length>MAX)throw Error('PDF exceeds the 50 MB limit.')
   if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('This URL returned a preview, sign-in page or non-PDF response. Follow the actual PDF download/source link; no PDF was imported.')
   return {bytes,sourceUrl:href,resolvedUrl:url,sha256:createHash('sha256').update(bytes).digest('hex')}
  }finally{await response.dispose()}
 }
 throw Error('Too many PDF redirects; no PDF imported.')
}
export async function importPdf(context,args,{enabled,sources,workerCall,upload=fetch}){
 const downloaded=await downloadPdf(context,args.url,{enabled,sources,sourcePageUrl:args.sourcePageUrl})
 return saveDownloadedPdf(downloaded,args,{workerCall,upload})
}
async function saveDownloadedPdf(downloaded,args,{workerCall,upload=fetch}){
 const ticket=await workerCall('start',{folderId:args.folderId,name:args.name,size:downloaded.bytes.length})
 const destination=new URL(ticket.uploadUrl)
 if(destination.protocol!=='https:')throw Error('Invalid upload destination.')
 const response=await upload(ticket.uploadUrl,{method:'PUT',headers:{'Content-Type':'application/pdf','x-upsert':'false'},body:downloaded.bytes,signal:AbortSignal.timeout(60000)}).catch(()=>{throw Error('PDF upload could not reach storage. No file was added to Files.')})
 if(!response.ok)throw Error('PDF upload failed. No file was added to Files.')
 const saved=await workerCall('finish',{id:ticket.id})
 const document=saved.documents?.find(item=>item.id===ticket.id&&item.kind==='pdf')
 if(!document)throw Error('PDF upload was not registered. Do not claim it was saved.')
 return {saved:true,document,revision:saved.revision,sourceUrl:args.url,sha256:downloaded.sha256,notice:'Actual PDF bytes saved. Use planner_read_file with this document ID and pageStart/pageCount until nextPage is null. Scanned images/diagrams still require visual review; do not claim unread pages were checked.'}
}

export async function importDownloadedPdf(workspace,args,{workerCall,upload=fetch}){
 // Only real files created by browser_action downloads; never arbitrary workspace files.
 const file=await workspaceFile(path.join(workspace,'browser-downloads'),args.localFile.replace(/^browser-downloads[\\/]/,''))
 if((await stat(file)).size>MAX)throw Error('PDF exceeds the 50 MB limit.')
 const bytes=await readFile(file)
 if(!bytes.length||bytes.length>MAX||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('Downloaded file is not a supported PDF. No PDF imported.')
 return saveDownloadedPdf({bytes,sha256:createHash('sha256').update(bytes).digest('hex')},{...args,url:undefined},{workerCall,upload})
}
