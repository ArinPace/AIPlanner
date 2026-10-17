import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeUpdates, parseUpdates } from './agent.js'
import type { StoredState } from '../src/types.js'
import type { FilesState } from '../src/lib/files.js'

const calendar: StoredState = {events:[],tags:[],hiddenTagIds:[],zoom:1}
const files: FilesState = {folders:[],files:[],documents:[]}
const update = {source:'brightspace',course:'Intro to CS',title:'Assignment 2',url:'https://brightspace.nyu.edu/d2l/assignment/2',summary:'Birthdays.java',dueAt:'2026-09-27T23:59:00-04:00'}

test('identical source URLs and titles in different courses never overwrite each other',()=>{
  const other={...update,course:'Cohort Leadership',summary:'Different course instructions'}
  const first=mergeUpdates(calendar,files,[update,other])
  assert.equal(first.files.files.length,4)
  assert.notEqual(first.files.files[0].folderId,first.files.files[1].folderId)
  assert.equal(first.calendar.events.length,2)
  const refreshed=mergeUpdates(first.calendar,first.files,[{...other,summary:'Updated leadership instructions'}])
  assert.equal(refreshed.files.files.length,4)
  assert.match(refreshed.files.files[0].content,/Birthdays.java/)
  assert.match(refreshed.files.files[1].content,/Updated leadership instructions/)
})

test('Albert and WhatsApp updates require their actual source hosts',()=>{
  for(const [source,url] of [['albert','https://sis.nyu.edu/student'],['whatsapp','https://web.whatsapp.com/']]){
    assert.equal(parseUpdates({summary:'Checked',needsLogin:false,updates:[{...update,source,url}]}).updates[0].source,source)
    assert.throws(()=>parseUpdates({summary:'Checked',needsLogin:false,updates:[{...update,source,url:'https://unrelated.test/'}]}),/unexpected source URL/)
  }
})
test('sync creates nested notes and an exact timezone-aware deadline, without duplicates',()=>{
  const first=mergeUpdates(calendar,files,[update])
  const second=mergeUpdates(first.calendar,first.files,[update])
  assert.equal(second.calendar.events.length,1)
  assert.equal(second.calendar.events[0].start,'2026-09-28T03:59:00.000Z')
  assert.equal(second.files.files.length,2)
  assert.equal(second.files.folders.length,2)
  assert.equal(second.files.folders[1].parentId,second.files.folders[0].id)
  assert.equal(calendar.events.length,0)
  assert.equal(files.folders.length,0)
})
test('changed deadlines update generated records while preserving manual edits',()=>{
  const first=mergeUpdates(calendar,files,[update])
  const changed={...update,dueAt:'2026-09-30T23:59:00-04:00',summary:'New deadline announced'}
  const fresh=mergeUpdates(first.calendar,first.files,[changed])
  assert.equal(fresh.calendar.events[0].start,'2026-10-01T03:59:00.000Z')
  first.calendar.events[0].title='My custom reminder'
  first.files.files[0].content='My personal notes'
  const edited=mergeUpdates(first.calendar,first.files,[changed])
  assert.equal(edited.calendar.events[0].title,'My custom reminder')
  assert.equal(edited.files.files[0].content,'My personal notes')
  assert.equal(edited.files.files.length,3)
  assert.match(edited.files.files.find(f=>f.id.startsWith('agent-') && f.content.includes('New deadline'))!.content,/New deadline/)
})
test('untrusted output rejects unknown destinations, invalid deadlines, and excess updates',()=>{
  const output={summary:'Checked',needsLogin:false,updates:[update]}
  assert.equal(parseUpdates(output).updates.length,1)
  assert.throws(()=>parseUpdates({...output,updates:[{...update,url:'https://evil.example/collect'}]}))
  assert.throws(()=>parseUpdates({...output,updates:[{...update,dueAt:'2026-09-27'}]}))
  assert.throws(()=>parseUpdates({...output,updates:Array(101).fill(update)}))
})

test('subject overview combines sources, reuses case-insensitive course folders and preserves personal writing',()=>{
 const first=mergeUpdates(calendar,files,[update]);const overview=first.files.files.find(f=>f.name==='Subject overview')!;
 assert.equal(overview.format,'note');assert.match(overview.content,/Assignments and deadlines/);assert.match(overview.content,/Birthdays.java/);
 overview.content+='\nMy personal study plan';
 const second=mergeUpdates(first.calendar,first.files,[{...update,source:'gmail',course:'intro TO cs',url:'https://mail.google.com/mail/u/0/#inbox/123456789012',title:'Syllabus',summary:'Read chapter one'}]);
 assert.equal(second.files.folders.length,2);assert.match(second.files.files.find(f=>f.id===overview.id)!.content,/My personal study plan/);
 const latest=second.files.files.find(f=>f.name==='Subject overview - latest sources')!;assert.match(latest.content,/Read chapter one/);assert.match(latest.content,/Birthdays.java/);
 const third=mergeUpdates(second.calendar,second.files,[{...update,summary:'Updated requirement'}]);assert.equal(third.files.files.filter(f=>f.name==='Subject overview - latest sources').length,1);
})

test('agent can reuse the actual legacy folder name including its generated suffix',()=>{
 const legacy={folders:[{id:'agent-synced-updates',parentId:null,name:'Agent updates',color:'#1a73e8',labels:['Synced'],updatedAt:new Date().toISOString()},{id:'agent-course-df6262',parentId:'agent-synced-updates',name:'Intro to Computer Science df6262',color:'#1a73e8',labels:['brightspace'],updatedAt:new Date().toISOString()}],files:[],documents:[]};
 const result=mergeUpdates(calendar,legacy,[{...update,course:'Intro to Computer Science df6262'}]);assert.equal(result.files.folders.length,2);assert.equal(result.files.files.find(f=>f.id.startsWith('agent-'))!.folderId,'agent-course-df6262');
})

test('real six-digit course codes are not mistaken for generated folder suffixes',()=>{
 const result=mergeUpdates(calendar,files,[{...update,course:'Mathematics 123456'},{...update,course:'Mathematics 654321'}]);assert.equal(result.files.folders.filter(f=>f.id.startsWith('agent-course-')).length,2);assert.ok(result.files.files.some(f=>f.name==='Subject overview' && f.content.includes('# Mathematics 123456')))
})
