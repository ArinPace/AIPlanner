import test from 'node:test'
import assert from 'node:assert/strict'
import {completeEventChecklist} from './event-checklist.js'
import {handleWidgetBackground} from './widget-background.js'
import {widgetSnapshot} from '../src/lib/widgetSnapshot.js'
import {checklistItems} from '../src/lib/checklistItems.js'
import {DEFAULT_PLANNING} from '../src/lib/planning.js'
import type {StoredState, CalendarEvent} from '../src/types.js'

test('parallel Done requests retry atomically and widget completion uses the same checklist gate', async () => {
 process.env.SUPABASE_URL = 'https://completion.test'
 process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture'
 const originalFetch = globalThis.fetch
 const itemId = '11111111-1111-4111-8111-111111111111'
 const event = (id: string): CalendarEvent => ({
  id, title: 'Assignment', start: '2026-11-11T13:00:00Z', end: '2026-11-11T14:00:00Z',
  allDay: false, description: '', tagIds: [], recurrence: {frequency: 'none', interval: 1, until: null},
  checklistLinks: [{noteId: 'work', itemId: itemId}],
 })
 let calendar: StoredState = {events: ['a','b','c'].map(event), tags: [], hiddenTagIds: []}
 let notes = [{id: 'work', systemRole: 'work', format: 'note', name: 'Work', folderId: null,
  updatedAt: '2026-11-11T12:00:00Z', content: '- [ ] [item:' + itemId + '] Assignment'}]
 let revision = 1
 let conflicts = 0
 globalThis.fetch = async (input, init) => {
  const request = new Request(input, init)
  const path = new URL(request.url).pathname
  if (path.endsWith('planner_event_check_context')) {
   const snapshot = structuredClone({calendar: {state: calendar, revision},
    notes, filesRevision: revision, planning: {state: DEFAULT_PLANNING, revision}})
   await new Promise(resolve => setTimeout(resolve, 10))
   return Response.json(snapshot)
  }
  if (path.endsWith('planner_commit_event_checks')) {
   const args = await request.json()
   if (args.p_calendar_revision !== revision) {
    conflicts++
    return Response.json({code: 'P0001', message: 'fixture revision conflict'}, {status: 409})
   }
   calendar = args.p_calendar
   for (const note of args.p_notes) notes = notes.map(old => old.id === note.id ? note : old)
   revision++
   return Response.json({calendarRevision: revision, filesRevision: revision})
  }
  if (path.endsWith('planner_calendars')) return Response.json({state: calendar, revision})
  throw Error('Unexpected operation ' + path)
 }
 try {
  await Promise.all(['a','b'].map(eventId => completeEventChecklist('owner', {
   revision: 1, eventId, occurrenceStart: '2026-11-11T13:00:00Z',
  })))
  assert.ok(conflicts > 0)
  assert.equal(checklistItems(notes[0].content)[0].checked, false)
  const feedback = {
   id: '22222222-2222-4222-8222-222222222222',
   task: {id: 'c@2026-11-11T13:00:00Z', title: 'Assignment',
    start: Date.parse('2026-11-11T13:00Z') / 1000, end: Date.parse('2026-11-11T14:00Z') / 1000},
   remainingMinutes: 0, done: true, reportedAt: Date.parse('2026-11-11T13:30Z') / 1000,
  }
  const post = () => handleWidgetBackground(new Request('https://completion.test/api/widget/feedback', {
   method: 'POST', body: JSON.stringify(feedback),
  }), '/api/widget/feedback', 'owner')
  assert.equal((await post()).status, 200)
  assert.equal(checklistItems(notes[0].content)[0].checked, true)
  const snapshot = widgetSnapshot(calendar.events, new Date('2026-11-11T13:30Z'))
  assert.ok(snapshot.events.every(event => event.isFreeTime && event.title === 'Free time' && event.color === '#ffffff'))
  const savedRevision = revision
  await post()
  assert.equal(revision, savedRevision)

  const routine = {...event('routine'), recurrence: {frequency: 'daily' as const, interval: 1, until: null}}
  calendar.events.push(routine)
  notes[0].content = notes[0].content.replace("- [x]", "- [ ]")
  const previousContent = notes[0].content
  await completeEventChecklist('owner', {revision, eventId: routine.id, occurrenceStart: routine.start},
   {feedbackId: '33333333-3333-4333-8333-333333333333', expectedEnd: Date.parse(routine.end) / 1000})
  assert.equal(notes[0].content, previousContent)
  assert.deepEqual(calendar.events.find(event => event.id === 'routine')!.completedStarts, [routine.start.replace('Z','.000Z')])
 } finally { globalThis.fetch = originalFetch }
})
