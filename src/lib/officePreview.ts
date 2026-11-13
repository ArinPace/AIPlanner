import {unzip,strFromU8} from 'fflate'
export type OfficeSection={title:string;paragraphs?:string[];rows?:string[][]}
const elements=(n:Document|Element,name:string)=>[...n.getElementsByTagNameNS('*',name)]
export async function officePreview(bytes:Uint8Array,name:string):Promise<OfficeSection[]>{
 let expanded=0
 const files=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>unzip(bytes,{filter:file=>{
  if(!/^(word\/document\.xml|xl\/(sharedStrings|workbook)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/worksheets\/sheet\d+\.xml|ppt\/slides\/slide\d+\.xml)$/.test(file.name))return false
  expanded+=file.originalSize
  return file.originalSize<=8*1024*1024&&expanded<=20*1024*1024
 }},(error,result)=>error?reject(error):resolve(result)))
 const xml=(path:string)=>{if(!files[path])return null;const d=new DOMParser().parseFromString(strFromU8(files[path]),'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('This document could not be read.');return d}
 if(/\.docx$/i.test(name)){
  const doc=xml('word/document.xml');if(!doc)throw Error('This Word document could not be previewed.')
  return [{title:'Document',paragraphs:elements(doc,'p').slice(0,3000).map(p=>elements(p,'t').map(t=>t.textContent||'').join(''))}]
 }
 if(/\.pptx$/i.test(name))return Object.keys(files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a,b)=>Number(a.match(/slide(\d+)/)![1])-Number(b.match(/slide(\d+)/)![1])).slice(0,200).map((path,i)=>({title:'Slide '+(i+1),paragraphs:elements(xml(path)!,'p').map(p=>elements(p,'t').map(t=>t.textContent||'').join(''))}))
 const shared=xml('xl/sharedStrings.xml'),strings=shared?elements(shared,'si').map(si=>elements(si,'t').map(t=>t.textContent||'').join('')):[]
 const workbook=xml('xl/workbook.xml'),rels=xml('xl/_rels/workbook.xml.rels')
 const sheets=workbook?elements(workbook,'sheet'):[]
 return Object.keys(files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort().slice(0,50).map(path=>{
  const rel=rels&&elements(rels,'Relationship').find(r=>'xl/'+(r.getAttribute('Target')||'').replace(/^\/?xl\//,'')===path)
  const sheet=sheets.find(s=>s.getAttribute('r:id')===rel?.getAttribute('Id'))
  return {title:sheet?.getAttribute('name')||path.split('/').at(-1)!,rows:elements(xml(path)!,'row').slice(0,500).map(row=>{
   const values:string[]=[]
   for(const cell of elements(row,'c')){let index=0;for(const c of (cell.getAttribute('r')||'A').match(/^[A-Z]+/)![0])index=index*26+c.charCodeAt(0)-64;if(index>100)continue;const v=elements(cell,'v')[0]?.textContent||'';values[index-1]=cell.getAttribute('t')==='s'?strings[Number(v)]||'':cell.getAttribute('t')==='inlineStr'?elements(cell,'t').map(t=>t.textContent||'').join(''):v}
   return Array.from({length:values.length},(_,i)=>values[i]||'')
  })}
 })
}
