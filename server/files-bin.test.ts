import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTrash, restoreFiles, selection } from './files-bin.js'
import type { FilesState } from '../src/lib/files.js'
const now='2026-10-17T00:00:00Z'
const state:FilesState={revision:7,folders:[{id:'parent',name:'School',parentId:null,color:'#123456',labels:['class'],updatedAt:now},{id:'child',name:'CS',parentId:'parent',color:'#654321',labels:[],updatedAt:now}],files:[{id:'note',name:'Notes.txt',folderId:'child',content:'Keep exact content',updatedAt:now}],documents:[{id:'82400000-0000-4000-8000-000000000001',name:'Assignment.pdf',folderId:'child',kind:'pdf',size:123,updatedAt:now},{id:'link',name:'Reading',folderId:'parent',kind:'link',url:'https://example.org/',updatedAt:now}]}

test('bulk file trash includes descendants once and restores exact content, PDF metadata and folder labels',()=>{
  const before=structuredClone(state),deleted=buildTrash(state,['parent','child','note'])
  assert.equal(deleted.entry.itemCount,5);assert.deepEqual(deleted.entry.names,['School'])
  assert.equal(deleted.state.folders.length,0);assert.equal(deleted.state.files.length,0)
  const restored=restoreFiles(deleted.state,[deleted.entry.snapshot])
  assert.deepEqual(restored,state);assert.deepEqual(state,before)
  assert.throws(()=>buildTrash(state,['unknown']),/changed/)
  assert.deepEqual(selection(['note','note']),['note']);assert.throws(()=>selection([]))
})

test('restoring never overwrites newer IDs or names and missing parents use a recovery folder',()=>{
  const note=buildTrash(state,['note']),remaining=structuredClone(note.state)
  remaining.files.push({...state.files[0],id:'new-note',content:'Newer text'})
  const restored=restoreFiles(remaining,[note.entry.snapshot])
  assert.equal(restored.files.find(f=>f.id==='new-note')!.content,'Newer text')
  assert.match(restored.files.find(f=>f.id==='note')!.name,/restored/)
  assert.throws(()=>restoreFiles(state,[note.entry.snapshot]),/overwrite/)
  const empty:FilesState={folders:[],files:[],documents:[]}
  const recovered=restoreFiles(empty,[note.entry.snapshot])
  assert.equal(recovered.folders[0].name,'Restored files')
  assert.equal(recovered.files[0].folderId,recovered.folders[0].id)
})
