import {ATTACHMENT_LIMIT,type ChatAttachment} from './chatAttachments'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read this file.'));reader.readAsDataURL(blob)})
async function thumbnail(data:string){const image=new window.Image();image.src=data;await image.decode();const canvas=document.createElement('canvas'),scale=Math.min(1,96/image.width,96/image.height);canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.6)}
export async function prepareAttachment(file:File):Promise<ChatAttachment>{
 if(!file.size || file.size>ATTACHMENT_LIMIT)throw Error('Choose nonempty files up to 2 MB. Up to four attachments can share a 2 MB total limit.')
 const base={id:crypto.randomUUID(),name:file.name.slice(0,160),size:file.size}
 const imageType=file.type || (/\.png$/i.test(file.name)?'image/png':/\.jpe?g$/i.test(file.name)?'image/jpeg':/\.webp$/i.test(file.name)?'image/webp':'')
 if(['image/png','image/jpeg','image/webp'].includes(imageType)){
  const data=await dataUrl(new Blob([file],{type:imageType}));return {...base,kind:'image',data,thumbnail:await thumbnail(data),coverage:'Attached image supplied to the agent for visual reading.'}
 }
 if(file.type==='application/pdf' || /\.pdf$/i.test(file.name)){
  const buffer=await file.arrayBuffer()
  if(!new TextDecoder().decode(buffer.slice(0,1024)).includes('%PDF-'))throw Error('This file is not a valid PDF.')
  const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc=pdfWorkerUrl
  const task=getDocument({data:new Uint8Array(buffer.slice(0))})
  try{
   const pdf=await task.promise,text:string[]=[],images:string[]=[]
   for(let n=1;n<=Math.min(pdf.numPages,20);n++){
    const page=await pdf.getPage(n),contents=await page.getTextContent()
    text.push('Page '+n+': '+contents.items.map(item=>'str' in item?item.str:'').join(' '))
    if(n<=4){const viewport=page.getViewport({scale:Math.min(1,640/page.getViewport({scale:1}).width)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,viewport}).promise;images.push(canvas.toDataURL('image/jpeg',.55))}
   }
   return {...base,kind:'pdf',data:await dataUrl(new Blob([buffer],{type:'application/pdf'})),text:text.join('\n\n').slice(0,50000),images,thumbnail:images[0]?await thumbnail(images[0]):undefined,coverage:`PDF has ${pdf.numPages} pages. Text extracted from first ${Math.min(pdf.numPages,20)} pages, capped at 50,000 characters; image previews of first ${Math.min(pdf.numPages,4)} pages supplied. Other pages/attachments are not visually covered.`}
  }finally{await task.destroy()}
 }
 if(file.type.startsWith('text/') || /\.(txt|md|csv|json|log|js|ts|tsx|jsx|py|java|html|htm|css|xml|yaml|yml)$/i.test(file.name)){
  const text=await file.text();if(text.includes('\0'))throw Error('This file is not a supported text document.')
  return {...base,kind:'text',data:await dataUrl(new Blob([file],{type:'text/plain'})),text:text.slice(0,50000),coverage:text.length>50000?'First 50,000 text characters supplied; file is truncated.':'Full attached text supplied.'}
 }
 throw Error(file.name+': supported attachments: PNG, JPEG, WebP, PDF, and plain text/code/CSV/JSON files.')
}
