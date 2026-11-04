import test from 'node:test'
import assert from 'node:assert/strict'
import {validateFilesState,FILES_WORKSPACE_MAX_BYTES,type FilesState} from '../src/lib/files.js'
import {body} from './cloud.js'
const workspace=(count:number):FilesState=>({revision:1,folders:[],files:Array.from({length:count},(_,i)=>({id:'note-'+i,name:'Note '+i,folderId:null,format:'note',content:'x'.repeat(900000),updatedAt:'2026-11-03T00:00:00Z'}))})
test('detailed reports can grow beyond the old 3MB ceiling while staying inside the supported transport budget',async()=>{
 const state=workspace(4),encoded=JSON.stringify(state)
 assert(Buffer.byteLength(encoded)>3*1024*1024)
 assert(Buffer.byteLength(encoded)<FILES_WORKSPACE_MAX_BYTES)
 assert.doesNotThrow(()=>validateFilesState(state))
 const parsed=await body(new Request('https://planner.test/api/files',{method:'PUT',body:encoded}))
 assert.equal((parsed.files as unknown[]).length,4)
 const excessive=workspace(5)
 assert.throws(()=>validateFilesState(excessive),/up to 4 MB/)
 await assert.rejects(()=>body(new Request('https://planner.test/api/files',{method:'PUT',body:JSON.stringify(excessive)})),/too large/)
 // Validate UTF-8 bytes, not JavaScript character counts.
 const unicode=workspace(4);for(const note of unicode.files)note.content='界'.repeat(400000)
 assert.throws(()=>validateFilesState(unicode),/up to 4 MB/)
})
