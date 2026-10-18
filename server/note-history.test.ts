import test from 'node:test'
import assert from 'node:assert/strict'
import {readNoteHistory} from './note-history.js'

test('history queries are owner/note scoped and paginated; snapshots exclude rich payloads',async()=>{
 const originalFetch=globalThis.fetch
 process.env.SUPABASE_URL='https://history.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  assert.equal(req.method,'GET');assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(url.searchParams.get('note_id'),'eq.note')
  if(url.searchParams.has('id'))return Response.json({id:7,before:{content:'a'.repeat(25000),richText:'hidden',richTextSource:'hidden'},after:{content:'new'}})
  if(url.searchParams.has('id')===false&&url.searchParams.has('limit'))assert.equal(url.searchParams.get('limit'),'21')
  if(url.searchParams.get('id')==='eq.0')throw Error('Unexpected')
  return Response.json(Array.from({length:21},(_,i)=>({id:30-i})))
 }
 try{
  const page=await readNoteHistory('owner',{noteId:'note'}) as any
  assert.equal(page.versions.length,20);assert.equal(page.nextBefore,11);assert.equal(page.hasMore,true)
  const detail=await readNoteHistory('owner',{noteId:'note',versionId:7}) as any
  assert.equal(detail.before.content.length,20000);assert.equal(detail.hasMore,true);assert.equal(detail.before.richText,undefined)
  const rest=await readNoteHistory('owner',{noteId:'note',versionId:7,offset:20000}) as any
  assert.equal(rest.before.content.length,5000);assert.equal(rest.hasMore,false)
 }finally{globalThis.fetch=originalFetch}
})
