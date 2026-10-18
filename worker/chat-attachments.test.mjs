import test from 'node:test'
import assert from 'node:assert/strict'
import {attachmentInput,claudeAttachmentInput} from './chat-attachments.mjs'
test('Codex and Claude receive actual image pixels and text with explicit coverage, not filenames alone',()=>{
 const image='data:image/png;base64,aGVsbG8='
 const items=[{name:'photo.png',kind:'image',data:image,coverage:'Attached image'},{name:'reading.pdf',kind:'pdf',text:'Page text',images:[image],coverage:'Only page 1'}]
 const codex=attachmentInput('Question',items)
 assert.equal(codex.filter(i=>i.type==='image').length,2)
 assert.equal(codex[2].url,image)
 assert.match(codex[3].text,/Only page 1/);assert.match(codex[3].text,/Page text/)
 assert.equal(codex[0].text,'Question')
 const claude=claudeAttachmentInput('Question',items)
 assert.deepEqual(claude[2],{type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}})
 assert.deepEqual(attachmentInput('Plain message'),[{type:'text',text:'Plain message'}])
})
