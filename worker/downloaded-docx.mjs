import {readFile,stat} from 'node:fs/promises'
import {inflateRawSync} from 'node:zlib'
import path from 'node:path'
import {workspaceFile} from './browser-control.mjs'

const MAX_XML=4*1024*1024
// Read only text-bearing OpenXML parts in memory. Never extract an archive,
// execute macros, resolve relationships, or fetch an external XML entity.
export function docxText(bytes){
 if(bytes.length<22||bytes.length>50*1024*1024)throw Error('Choose a supported DOCX up to 50 MB.')
 const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]))
 if(end<0||end+22>bytes.length)throw Error('The downloaded file is not a supported DOCX ZIP package.')
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('Multi-volume DOCX packages are unsupported.')
 const count=bytes.readUInt16LE(end+10),directoryEnd=bytes.readUInt32LE(end+16)+bytes.readUInt32LE(end+12)
 let cursor=bytes.readUInt32LE(end+16),total=0;const parts=[]
 if(count>5000||directoryEnd>end)throw Error('DOCX package exceeds supported limits.')
 for(let i=0;i<count;i++){
  if(cursor+46>directoryEnd||bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid DOCX directory.')
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42)
  if(cursor+46+nameLength+extra+comment>directoryEnd)throw Error('Invalid DOCX directory entry.')
  const name=bytes.toString('utf8',cursor+46,cursor+46+nameLength);cursor+=46+nameLength+extra+comment
  if(!/^word\/(?:document|comments|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(name))continue
  if(flags&1||![0,8].includes(method)||size>MAX_XML||total+size>MAX_XML)throw Error('DOCX text is encrypted or exceeds supported extraction limits.')
  if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid DOCX member.')
  const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28)
  if(start+compressed>directoryEnd)throw Error('Truncated DOCX member.')
  const encoded=bytes.subarray(start,start+compressed),xml=method===8?inflateRawSync(encoded,{maxOutputLength:MAX_XML-total}):encoded
  if(xml.length!==size)throw Error('DOCX member size does not match.')
  total+=xml.length
  const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{
   const simple={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(simple[entity])return simple[entity]
   const hex=entity.startsWith('&#x'),n=Number.parseInt(entity.slice(hex?3:2,-1),hex?16:10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):''
  })
  const text=xml.toString('utf8').replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<w:(?:br|cr)\b[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g,'').replace(/<[^>]*>/g,'')
  parts.push({name,text:decode(text).trim()})
 }
 if(!parts.some(p=>p.name==='word/document.xml'))throw Error('The file has no Word document body.')
 return parts.sort((a,b)=>Number(b.name==='word/document.xml')-Number(a.name==='word/document.xml')).map(p=>'['+p.name+']\n'+p.text).join('\n\n')
}
export async function readDownloadedDocx(workspace,{localFile,offset=0,limit=20000}){
 const file=await workspaceFile(path.join(workspace,'browser-downloads'),localFile.replace(/^browser-downloads[\\/]/,''))
 if((await stat(file)).size>50*1024*1024)throw Error('DOCX exceeds 50 MB.')
 const text=docxText(await readFile(file))
 return {text:text.slice(offset,offset+limit),offset,totalCharacters:text.length,hasMore:offset+limit<text.length,nextOffset:offset+limit<text.length?offset+limit:null,coverage:'Text from document, comments, footnotes/endnotes and headers/footers. Paginate until hasMore=false. Formatting, numbering, drawings, equations, linked files, page layout and visual review are not covered. No PDF was created or imported.'}
}
