import assert from 'node:assert/strict'
import { test } from 'node:test'
import { widgetSnapshot } from '../src/lib/widgetSnapshot'
import type { CalendarEvent } from '../src/types'
const now = new Date('2026-10-31T16:00:00Z')
const event = (id:string, extra:Partial<CalendarEvent>={}):CalendarEvent => ({id,title:id,description:'',start:'2026-10-31T15:00:00Z',end:'2026-10-31T17:00:00Z',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null},...extra})
test('widgets include timed activities, omit containers, all-day and reminders',()=>{
 const snapshot=widgetSnapshot([event('folder',{eventKind:'folder'}),event('child',{folderId:'folder'}),event('all-day',{allDay:true}),event('reminder',{reminder:true})],now)
 assert.deepEqual(snapshot.events.map(e=>e.title),['child'])
 assert.equal(snapshot.events[0].start,Date.parse('2026-10-31T15:00:00Z')/1000)
})
test('recurring folder children follow the calendar across daylight saving and excluded occurrences',()=>{
 const snapshot=widgetSnapshot([event('folder',{eventKind:'folder',recurrence:{frequency:'daily',interval:1,until:null},excludedStarts:['2026-11-01T16:00:00.000Z']}),event('child',{folderId:'folder'})],now)
 assert.equal(snapshot.events.length,6)
 assert.ok(!snapshot.events.some(e=>e.start===Date.parse('2026-11-01T16:00:00Z')/1000))
 assert.ok(snapshot.events.some(e=>e.start===Date.parse('2026-11-02T16:00:00Z')/1000))
})
test('empty calendar clears activities and snapshots expire after seven days',()=>{
 const snapshot=widgetSnapshot([],now)
 assert.deepEqual(snapshot.events,[])
 assert.equal(snapshot.validUntil-snapshot.generatedAt,7*86400)
})
