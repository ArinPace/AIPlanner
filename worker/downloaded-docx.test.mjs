import test from 'node:test'
import assert from 'node:assert/strict'
import {deflateRawSync} from 'node:zlib'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {docxText,readDownloadedDocx} from './downloaded-docx.mjs'
function zip(entries){
 const local=[],central=[];let offset=0
 for(const [name,xml] of Object.entries(entries)){
  const n=Buffer.from(name),bytes=Buffer.from(xml),compressed=deflateRawSync(bytes),header=Buffer.alloc(30),entry=Buffer.alloc(46)
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(8,8);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(n.length,26)
  entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(8,10);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42)
  local.push(header,n,compressed);central.push(entry,n);offset+=header.length+n.length+compressed.length
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16)
 return Buffer.concat([...local,directory,end])
}
const fixture=()=>zip({'word/document.xml':'<w:document><w:body><w:p><w:r><w:t>Full syllabus &amp; essay</w:t></w:r></w:p><w:p><w:delText>Old deleted grade</w:delText><w:r><w:t>Current score &#x41;</w:t></w:r></w:p></w:body></w:document>','word/comments.xml':'<w:comments><w:comment><w:p><w:r><w:t>Instructor feedback</w:t></w:r></w:p></w:comment></w:comments>','secret.txt':'Must not be returned'})
test('downloaded native Word text and comments are readable without inventing PDF or visual coverage',async()=>{
 const text=docxText(fixture());assert.match(text,/Full syllabus & essay/);assert.match(text,/Current score A/);assert.match(text,/Instructor feedback/);assert(!text.includes('Old deleted grade'));assert(!text.includes('Must not be returned'))
 const root=await mkdtemp(path.join(os.tmpdir(),'planner-docx-'))
 try{
  await mkdir(path.join(root,'browser-downloads'));await writeFile(path.join(root,'browser-downloads','syllabus.docx'),fixture())
  const first=await readDownloadedDocx(root,{localFile:'browser-downloads/syllabus.docx',limit:20});assert(first.hasMore)
  const last=await readDownloadedDocx(root,{localFile:'browser-downloads/syllabus.docx',offset:first.nextOffset,limit:30000});assert.equal(first.text+last.text,text);assert(!last.hasMore);assert.match(last.coverage,/No PDF was created/)
  await writeFile(path.join(root,'private.docx'),fixture());await assert.rejects(()=>readDownloadedDocx(root,{localFile:'../private.docx'}),/working folder/)
 }finally{await rm(root,{recursive:true,force:true})}
})
test('invalid, oversized, encrypted and decompression bomb packages fail explicitly',()=>{
 assert.throws(()=>docxText(Buffer.from('<html>Sign in</html>')),/supported/)
 assert.throws(()=>docxText(zip({'word/document.xml':'X'.repeat(4*1024*1024+1)})),/limits/)
 const encrypted=fixture(),central=encrypted.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));encrypted.writeUInt16LE(1,central+8);assert.throws(()=>docxText(encrypted),/encrypted/)
 assert.throws(()=>docxText(zip({'not-word.txt':'not Word'})),/no Word/)
})
