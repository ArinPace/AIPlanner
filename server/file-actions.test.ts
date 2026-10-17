import test from 'node:test'
import assert from 'node:assert/strict'
import { moveItems, navigationFolders } from '../src/lib/fileActions.js'
import type { FilesState } from '../src/lib/files.js'
const now='2026-10-17T00:00:00Z'
function fixture():FilesState { return {revision:4,folders:[{id:'parent',parentId:null,name:'Parent',color:'#123456',labels:['keep'],updatedAt:now},{id:'child',parentId:'parent',name:'Child',color:'#123456',labels:[],updatedAt:now},{id:'target',parentId:null,name:'Target',color:'#123456',labels:[],updatedAt:now}],files:[{id:'note',folderId:'child',name:'Note.txt',content:'keep exactly',updatedAt:now}],documents:[]} }
test('bulk move preserves selected nested structure and file contents without mutating state',()=>{
  const state=fixture(),next=moveItems(state,['parent','child','note'],'target')
  assert.equal(next.folders.find(f=>f.id==='parent')?.parentId,'target')
  assert.equal(next.folders.find(f=>f.id==='child')?.parentId,'parent')
  assert.equal(next.files[0].folderId,'child')
  assert.equal(next.files[0].content,'keep exactly')
  assert.deepEqual(next.folders.find(f=>f.id==='parent')?.labels,['keep'])
  assert.equal(state.folders[0].parentId,null)
  assert.throws(()=>moveItems(state,['parent'],'child'),/outside/)
  assert.throws(()=>moveItems(state,['note'],null),/Choose a folder/)
  assert.equal(moveItems(state,['note'],'target').files[0].folderId,'target')
})
test('collapsed navigation hides only descendants and preserves other branches',()=>{
  assert.deepEqual(navigationFolders(fixture(),new Set(['parent'])).map(f=>f.folder.id),['parent','target'])
  assert.deepEqual(navigationFolders(fixture(),new Set()).map(f=>f.folder.id),['parent','child','target'])
})
