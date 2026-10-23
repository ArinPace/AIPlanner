import {createHash} from 'node:crypto'
import type {CalendarEvent} from '../src/types.js'
import {PlannerDate} from '../src/lib/timezone.js'
import {addDays,toDateInput,endOfDateInput} from '../src/lib/dates.js'
export function fixedGoogleId(username:string,id:string){return 'aip'+createHash('sha256').update(username+'\0'+id).digest('hex')}
export function fixedEventPayload(event:CalendarEvent){
 const time=(iso:string)=>({dateTime:iso,timeZone:'America/New_York'})
 const start=new PlannerDate(event.start),end=new PlannerDate(event.end)
 const payload:Record<string,any>={summary:event.title,description:event.description||'',start:event.allDay?{date:toDateInput(start)}:time(event.start),end:event.allDay?{date:toDateInput(addDays(end,1))}:time(event.reminder?new Date(Date.parse(event.start)+60000).toISOString():event.end)}
 if(!event.allDay&&Date.parse(payload.end.dateTime)<=Date.parse(event.start))throw Error('Fixed event needs an end after its start.')
 if(event.recurrence.frequency!=='none'){
  let rule='RRULE:FREQ='+event.recurrence.frequency.toUpperCase()+';INTERVAL='+Math.max(1,event.recurrence.interval)
  if(event.recurrence.until)rule+=';UNTIL='+(event.allDay?event.recurrence.until.replaceAll('-',''):new Date(endOfDateInput(event.recurrence.until).getTime()).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'))
  payload.recurrence=[rule]
 }else payload.recurrence=[]
 return payload
}
export function fixedFingerprint(event:CalendarEvent){return createHash('sha256').update(JSON.stringify(fixedEventPayload(event))).digest('hex')}
