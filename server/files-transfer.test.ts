import test from 'node:test'
import assert from 'node:assert/strict'
import {filesManifest,readFilesTransferItem} from './files-transfer.js'
import {applyFilesPatch,filesPatches} from '../src/lib/filesTransfer.js'
import {filesWorkspaceLimit,validateFilesState,FILES_ITEM_MAX_BYTES,type FilesState} from '../src/lib/files.js'
const note=(i:number,content='Note '+i)=>({id:'note-'+i,name:'Note '+i,folderId:null,format:'note' as const,content,updatedAt:'2026-11-03T00:00:00Z'})
test('25MB allowance is arin-only and a large workspace transfers one changed note at a time',()=>{
 const original:FilesState={revision:7,folders:[],documents:[],files:Array.from({length:28},(_,i)=>note(i,'x'.repeat(900000)))}
 assert(Buffer.byteLength(JSON.stringify(original))>24*1024*1024)
 assert.doesNotThrow(()=>validateFilesState(original,filesWorkspaceLimit('arin')))
 assert.throws(()=>validateFilesState({...original,storageLimitBytes:filesWorkspaceLimit('arin')},filesWorkspaceLimit('another-user')),/up to 4 MB/)
 const manifest=filesManifest(original,'arin');assert.equal(manifest.storageLimitBytes,25*1024*1024)
 assert(Buffer.byteLength(JSON.stringify(manifest))<10000)
 assert(manifest.items.every(entry=>!entry.value))
 const next={...original,files:original.files.map((item,i)=>i===8?{...item,content:'Corrected error report'}:item)}
 const patches=filesPatches(original,next)
 assert.equal(patches.length,1);assert.deepEqual(patches[0].upserts?.files?.map(f=>f.id),['note-8'])
 assert(Buffer.byteLength(JSON.stringify(patches[0]))<500)
 const merged=applyFilesPatch(original,{...patches[0],revision:7})
 assert.deepEqual(merged,next);assert.equal(merged.files[0],original.files[0]);assert.equal(original.files[8].content.length,900000)
 const multiple={...next,files:next.files.map((item,i)=>i<2?{...item,content:'y'.repeat(900000)}:item)}
 assert(filesPatches(next,multiple).every(patch=>patch.upserts?.files?.length===1))
 assert.throws(()=>applyFilesPatch(original,{upserts:{files:[note(1),note(1)]}}),/Invalid Files patch/)
 assert.throws(()=>validateFilesState({folders:[],files:[note(0,'界'.repeat(FILES_ITEM_MAX_BYTES/3+1))]}),/per-note transfer/)
})
test('one-item reads enforce owner, revision, collection and index without selecting the whole corpus',async()=>{
 const before=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'] as const,env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://transfer.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 let queries=0
 globalThis.fetch=async(input,init)=>{
  const url=new URL(new Request(input,init).url);queries++
  assert.equal(url.searchParams.get('username'),'eq.arin');assert.equal(url.searchParams.get('revision'),'eq.7')
  assert.equal(url.searchParams.get('select'),'revision,item:state->files->8')
  return Response.json({revision:7,item:note(8)})
 }
 try{
  const url=new URL('https://planner.test/api/files/item?section=files&index=8&revision=7&id=note-8')
  assert.equal((await readFilesTransferItem('arin',url)).item.id,'note-8')
  url.searchParams.set('id','different');await assert.rejects(()=>readFilesTransferItem('arin',url),/Files changed/)
  url.searchParams.set('section','credentials');await assert.rejects(()=>readFilesTransferItem('arin',url),/valid file/)
  assert.equal(queries,2)
 }finally{globalThis.fetch=before;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})


test('deployed API entry point forwards PATCH into authenticated handling',async()=>{
 const {PATCH}=await import('../api/index.js')
 const response=await PATCH(new Request('https://planner.test/api/files',{method:'PATCH',body:'{}'}))
 assert.equal(response.status,401)
 assert.match((await response.json()).error,/sign in/)
})
