import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {validateAttachments,attachmentSummaries} from './chat-attachments.js'
import {handleVmRequest} from './vm.js'
const text=()=>({id:randomUUID(),name:'example.txt',kind:'text',size:5,data:'data:text/plain;base64,aGVsbG8=',text:'hello',coverage:'Full text'})
test('attachments validate count, IDs, actual bytes, MIME signatures and keep payload out of metadata',()=>{
 const a=text(),valid=validateAttachments([a]);assert.equal(valid[0].text,'hello')
 assert.equal((attachmentSummaries(valid)[0] as any).data,undefined)
 assert.equal((attachmentSummaries(valid)[0] as any).text,undefined)
 assert.deepEqual(validateAttachments(undefined),[])
 for(const value of [null,[a,a],Array.from({length:5},text),[{...a,size:6}],[{...a,kind:'image'}],[{...a,data:'https://example.com/image.png'}],[{...a,id:'../private'}]])assert.throws(()=>validateAttachments(value))
 const data='data:text/plain;base64,'+Buffer.alloc(1024*1024+1,65).toString('base64')
 assert.throws(()=>validateAttachments([1,2].map(()=>({...text(),size:1024*1024+1,data}))),/2 MB/)
})

test('attachment download checks the signed-in owner and does not expose a stored payload by guessing IDs',async()=>{
 const before=globalThis.fetch,old=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'].map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://attachment-owner.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';delete process.env.SUPABASE_SECRET_KEY
 const attachment=text(),job=randomUUID(),missing=randomUUID()
 globalThis.fetch=async(input,init)=>{
  const url=new URL(new Request(input,init).url);assert.equal(url.hostname,'attachment-owner.test');assert.equal(url.searchParams.get('username'),'eq.arin')
  return Response.json(url.searchParams.get('id')==='eq.'+job?{attachment_payload:[attachment]}:null)
 }
 try{
  const request=(id:string)=>new Request('https://planner.test/api/agent/vm/attachment?job='+id+'&id='+attachment.id)
  const result=await handleVmRequest(request(job),'/api/agent/vm/attachment','arin')
  assert.equal(await result.text(),'hello');assert.equal(result.headers.get('x-content-type-options'),'nosniff');assert.match(result.headers.get('content-disposition')||'',/attachment/)
  await assert.rejects(()=>handleVmRequest(request(missing),'/api/agent/vm/attachment','arin'),/not found/)
 }finally{globalThis.fetch=before;for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
