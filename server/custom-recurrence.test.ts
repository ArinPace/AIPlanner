
import test from 'node:test'
import assert from 'node:assert/strict'
import {expandEvent,expandEvents,recurrenceLabel} from '../src/lib/recurrence.js'
import {normalizeEventFolders,validateEventFolders} from '../src/lib/eventFolders.js'
import {fixedEventPayload} from './fixed-event-payload.js'
import type {CalendarEvent} from '../src/types.js'
const event=(id:string,patch:Partial<CalendarEvent>={}):CalendarEvent=>({id,title:id,description:'',start:'2026-10-26T13:00:00Z',end:'2026-10-26T14:00:00Z',allDay:false,tagIds:[],recurrence:{frequency:'custom',weekdays:[1,3,5],interval:1,until:'2026-11-06'},...patch})
const dates=(items:ReturnType<typeof expandEvent>)=>items.map(item=>new Date(item.start.getTime()).toISOString())
test('custom weekdays retain local time across DST, honor end date and selected weeks',()=>{
 const e=event('custom'),from=new Date('2026-10-25T00:00Z'),through=new Date('2026-11-30T23:59Z')
 assert.deepEqual(dates(expandEvent(e,from,through)),['2026-10-26T13:00:00.000Z','2026-10-28T13:00:00.000Z','2026-10-30T13:00:00.000Z','2026-11-02T14:00:00.000Z','2026-11-04T14:00:00.000Z','2026-11-06T14:00:00.000Z'])
 const fortnight=event('fortnight',{recurrence:{frequency:'custom',weekdays:[1,3],interval:2,until:'2026-11-25'}})
 assert.deepEqual(dates(expandEvent(fortnight,from,through)).map(value=>value.slice(0,10)),['2026-10-26','2026-10-28','2026-11-09','2026-11-11','2026-11-23','2026-11-25'])
 assert.match(recurrenceLabel(e.recurrence),/Mon, Wed, Fri/)
 assert.throws(()=>validateEventFolders([event('bad',{recurrence:{frequency:'custom',weekdays:[],interval:1,until:null}})]),/weekday/)
})
test('Google custom repeats use weekly BYDAY and start on the first selected weekday',()=>{
 const payload=fixedEventPayload(event('google',{start:'2026-10-25T13:00:00Z',end:'2026-10-25T14:00:00Z'}))
 assert.equal(Date.parse(payload.start.dateTime),Date.parse('2026-10-26T13:00:00Z'))
 assert.match(payload.recurrence[0],/^RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;WKST=SU/)
})
test('custom recurring folder children crossing midnight inherit shifted weekdays and week anchor',()=>{
 const root=event('root',{eventKind:'folder',start:'2026-11-01T03:00:00Z',end:'2026-11-01T04:30:00Z',recurrence:{frequency:'custom',weekdays:[0,6],interval:2,until:'2026-11-16'}})
 const events=normalizeEventFolders([root,event('prep',{folderId:'root',start:root.start,end:'2026-11-01T03:30:00Z',recurrence:{frequency:'none',interval:1,until:null}}),event('later',{folderId:'root',start:'2026-11-01T04:15:00Z',end:'2026-11-01T04:30:00Z',recurrence:{frequency:'none',interval:1,until:null}})])
 const child=events.find(item=>item.id==='later')!
 assert.deepEqual(child.recurrence.weekdays,[0,1]);assert.equal(child.recurrence.weekStartsOn,1)
 const from=new Date('2026-10-30T00:00Z'),to=new Date('2026-11-18T00:00Z')
 assert.deepEqual(dates(expandEvent(child,from,to)),dates(expandEvents(events,from,to).filter(item=>item.event.id==='later')))
 assert.match(fixedEventPayload(child).recurrence[0],/BYDAY=SU,MO;WKST=MO/)
})

test('alternate Tuesdays and every fourth Monday use the selected week interval',()=>{
 const from=new Date('2026-10-25T00:00Z'),to=new Date('2026-12-31T23:59Z')
 const alternating=event('tuesday',{recurrence:{frequency:'custom',weekdays:[2],interval:2,until:'2026-11-30'}})
 assert.deepEqual(dates(expandEvent(alternating,from,to)).map(value=>value.slice(0,10)),['2026-10-27','2026-11-10','2026-11-24'])
 const monday=event('monday',{recurrence:{frequency:'custom',weekdays:[1],interval:4,until:'2026-12-31'}})
 assert.deepEqual(dates(expandEvent(monday,from,to)).map(value=>value.slice(0,10)),['2026-10-26','2026-11-23','2026-12-21'])
})
test('specific month dates skip missing dates, retain local time, support month intervals and export Google rules',()=>{
 const monthly=event('monthly',{start:'2027-01-01T14:00:00Z',end:'2027-01-01T15:00:00Z',recurrence:{frequency:'custom',customMode:'monthdates',monthDays:[1,15,31],interval:1,until:'2027-03-31'}})
 validateEventFolders([monthly])
 const items=dates(expandEvent(monthly,new Date('2027-01-01T00:00Z'),new Date('2027-04-01T00:00Z')))
 assert.deepEqual(items.map(value=>value.slice(0,10)),['2027-01-01','2027-01-15','2027-01-31','2027-02-01','2027-02-15','2027-03-01','2027-03-15','2027-03-31'])
 assert.equal(items[6],'2027-03-15T13:00:00.000Z')
 const alternate={...monthly,recurrence:{...monthly.recurrence,monthDays:[5,20],interval:2,until:'2027-05-31'}}
 assert.deepEqual(dates(expandEvent(alternate,new Date('2027-01-01T00:00Z'),new Date('2027-06-01T00:00Z'))).map(value=>value.slice(0,10)),['2027-01-05','2027-01-20','2027-03-05','2027-03-20','2027-05-05','2027-05-20'])
 const payload=fixedEventPayload(alternate)
 assert.match(payload.recurrence[0],/^RRULE:FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=5,20;/)
 assert.equal(Date.parse(payload.start.dateTime),Date.parse('2027-01-05T14:00:00Z'))
 assert.match(recurrenceLabel(alternate.recurrence),/Every 2 months on dates 5, 20/)
 assert.throws(()=>validateEventFolders([{...monthly,recurrence:{...monthly.recurrence,monthDays:[]}}]),/dates/)
})
