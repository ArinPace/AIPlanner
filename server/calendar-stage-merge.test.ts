import test from 'node:test'
import assert from 'node:assert/strict'
import {rebaseCalendarDraft} from './calendar-stage-merge.js'
import type {StoredState} from '../src/types.js'

const base: StoredState = {events:[{id:'one',title:'Class',description:'Room 1',start:'2026-11-12T14:00:00Z',end:'2026-11-12T15:00:00Z',tagIds:[],allDay:false,recurrence:{frequency:'none',interval:1,until:null}}],tags:[],hiddenTagIds:[]}
test('parallel drafts retain unrelated newer events, fields and completion metadata', () => {
 const draft = structuredClone(base), current = structuredClone(base)
 draft.events[0].title='Reviewed class title'
 current.events[0].description='New room'
 current.events[0].completedStarts=[current.events[0].start]
 current.events.push({...current.events[0],id:'two',title:'New appointment'})
 const result = rebaseCalendarDraft(base,draft,current)
 assert.equal(result.events.length,2)
 assert.equal(result.events[0].title,'Reviewed class title')
 assert.equal(result.events[0].description,'New room')
 assert.deepEqual(result.events[0].completedStarts,current.events[0].completedStarts)
})
test('a conflicting parallel draft stays saved for review instead of silently replacing newer changes', () => {
 const draft=structuredClone(base),current=structuredClone(base)
 draft.events[0].title='Draft correction';current.events[0].title='Manual correction'
 assert.throws(()=>rebaseCalendarDraft(base,draft,current),/draft is saved.*newer changes/)
 const removal=structuredClone(base);removal.events=[]
 assert.throws(()=>rebaseCalendarDraft(base,removal,current),/draft is saved/)
})

test('queued export accepts prior verified Planner etags and still rejects external edits', async () => {
 process.env.SUPABASE_URL='https://queued-stage.test'
 process.env.SUPABASE_SERVICE_ROLE_KEY='fixture'
 const {assertQueuedStageEvent} = await import('./calendar-staging.js')
 const {fixedEventPayload} = await import('./fixed-event-payload.js')
 const original=globalThis.fetch
 const previous={id:'previous',username:'owner',status:'published',approved_revision:5,payload:{calendar:base}}
 const stage={id:'next',username:'owner',base_revision:5,account_id:'account',payload:{calendar:base,google:{events:[{id:'remote',etag:'initial'}]}}} as any
 const before={id:'remote',etag:'own-write',...fixedEventPayload(base.events[0])}
 const mappings=[{local_id:'one',remote_id:'remote',remote_etag:'own-write',applied_stage_id:'previous'}]
 globalThis.fetch=async(input,init)=>{
  const url=new URL(new Request(input,init).url)
  assert.equal(url.searchParams.get('username'),'eq.owner')
  assert.equal(url.searchParams.get('id'),'eq.previous')
  return Response.json(previous)
 }
 try{
  await assert.doesNotReject(()=>assertQueuedStageEvent('owner',stage,'remote',before,mappings))
  await assert.rejects(()=>assertQueuedStageEvent('owner',stage,'remote',{...before,etag:'external'},mappings),/Google event changed/)
  await assert.rejects(()=>assertQueuedStageEvent('owner',stage,'remote',{...before,summary:'External title'},mappings),/Google event changed/)
 }finally{globalThis.fetch=original}
})
