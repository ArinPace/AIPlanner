import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTrash, restoreFiles, selection } from './files-bin.js'
import { validateFilesState } from '../src/lib/files.js'
test('planning notes cannot be removed directly, in bulk, or through their containing folder',()=>{
 const state:FilesState={folders:[{id:'folder',parentId:null,name:'Plans',color:'#123456',labels:[],updatedAt:'2026-10-18T00:00:00Z'}],files:[{id:'goals',systemRole:'goals',format:'note',folderId:'folder',name:'Goals',content:'Keep me',updatedAt:'2026-10-18T00:00:00Z'},{id:'regular',folderId:null,name:'Regular',content:'Unrelated',updatedAt:'2026-10-18T00:00:00Z'}]}
 for(const ids of [['goals'],['goals','regular'],['folder']])assert.throws(()=>buildTrash(state,ids),/permanent planning notes/)
 assert.equal(buildTrash(state,['regular']).state.files[0].content,'Keep me')
})

test('top-level notes, links and PDFs validate and restore to Files without creating a folder',()=>{
  const root:FilesState={folders:[],files:[{id:'root-note',folderId:null,name:'Root.txt',content:'Preserve root content',updatedAt:'2026-10-17T00:00:00Z'}],documents:[{id:'82400000-0000-4000-8000-000000000002',folderId:null,name:'Root.pdf',kind:'pdf',size:123,updatedAt:'2026-10-17T00:00:00Z'},{id:'root-link',folderId:null,name:'Root link',kind:'link',url:'https://example.org/',updatedAt:'2026-10-17T00:00:00Z'}]}
  validateFilesState(root)
  const trash=buildTrash(root,['root-note',...root.documents!.map(d=>d.id)])
  assert.equal(trash.entry.itemCount,3)
  assert.equal(trash.state.files.length,0)
  assert.deepEqual(restoreFiles(trash.state,[trash.entry.snapshot]),root)
  assert.throws(()=>validateFilesState({...root,files:[{...root.files[0],folderId:'missing'}]}),/existing folder/)
})
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
