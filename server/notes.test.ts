import test from 'node:test'
import assert from 'node:assert/strict'
import {validateFilesState, type FilesState} from '../src/lib/files.js'
import {buildTrash, restoreFiles} from './files-bin.js'

function fixture(): FilesState {
  const content='- [x] Read syllabus\n\n**Remember** #school'
  return {folders:[],files:[{id:'rich-note',folderId:null,name:'Course notes',format:'note',content,pinned:true,tags:['school'],updatedAt:'2026-10-18T00:00:00Z',richTextSource:content,richText:JSON.stringify({type:'doc',content:[{type:'taskList',content:[{type:'taskItem',attrs:{checked:true},content:[{type:'paragraph',content:[{type:'text',text:'Read syllabus'}]}]}]},{type:'paragraph',content:[{type:'text',text:'Remember',marks:[{type:'bold'}]}]}]})}]}
}

test('rich notes retain formatting, checks, tags and pins through trash and restore',()=>{
  const state=fixture()
  validateFilesState(state)
  const deleted=buildTrash(state,['rich-note'])
  const restored=restoreFiles(deleted.state,[deleted.entry.snapshot])
  assert.deepEqual(restored,{...state,documents:[]})
  validateFilesState(restored)
})

test('rich notes reject malformed documents, deep nesting and non-web images',()=>{
  const state=fixture(),note=state.files[0]
  const check=(richText:string)=>validateFilesState({...state,files:[{...note,richText}]})
  assert.throws(()=>check('{broken'),/document/)
  assert.throws(()=>check(JSON.stringify({type:'paragraph'})),/document/)
  assert.throws(()=>check(JSON.stringify({type:'doc',content:[{type:'image',attrs:{src:'javascript:alert(1)'}}]})),/web URL/)
  let nested:object={type:'paragraph'}
  for(let i=0;i<66;i++)nested={type:'blockquote',content:[nested]}
  assert.throws(()=>check(JSON.stringify({type:'doc',content:[nested]})),/complex/)
  assert.throws(()=>validateFilesState({...state,files:[{...note,format:undefined}]}),/rich note/)
})
