import test from 'node:test'
import assert from 'node:assert/strict'
import {patchPlannerNote} from './planner-notes.js'
import type {PlannerTextFile} from '../src/lib/files.js'

const plain:PlannerTextFile={id:'keep-id',folderId:null,name:'Goals',content:'Keep my goals',updatedAt:'2026-10-18T00:00:00Z',agentSnapshot:'keep snapshot'}
test('converting text to a real Note preserves identity, location and all writing',()=>{
  const note=patchPlannerNote(plain,{format:'note'})
  assert.deepEqual(note,{...plain,format:'note'})
  assert.equal(plain.format,undefined)
})
test('metadata changes preserve rich formatting; changed Markdown invalidates stale rich snapshots',()=>{
  const rich={...plain,format:'note' as const,pinned:true,tags:['goals'],richText:'{"type":"doc"}',richTextSource:plain.content}
  const renamed=patchPlannerNote(rich,{name:'Life goals'})
  assert.equal(renamed.richText,rich.richText)
  assert.equal(renamed.pinned,true)
  const edited=patchPlannerNote(rich,{content:'- [ ] A new goal #school'})
  assert.equal(edited.format,'note')
  assert.equal(edited.richText,undefined)
  assert.equal(edited.richTextSource,undefined)
  assert.equal(edited.pinned,true)
  assert.deepEqual(edited.tags,['school'])
  assert.equal(edited.agentSnapshot,'keep snapshot')
  const text=patchPlannerNote(rich,{format:'text'})
  assert.equal(text.format,undefined)
  assert.equal(text.content,plain.content)
  assert.equal(text.richText,undefined)
})
