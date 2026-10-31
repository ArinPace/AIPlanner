import {expandEvent} from '../src/lib/recurrence.js'
import {createHash} from 'node:crypto'
import type {CalendarEvent} from '../src/types.js'
import {PlannerDate} from '../src/lib/timezone.js'
import {addDays,toDateInput,endOfDateInput} from '../src/lib/dates.js'
export function fixedGoogleId(username:string,id:string){return 'aip'+createHash('sha256').update(username+'\0'+id).digest('hex')}
export function fixedEventPayload(event:CalendarEvent){
 if(event.recurrence.frequency==='custom'){
  const anchor=new PlannerDate(event.start)
  const first=expandEvent({...event,excludedStarts:[],inheritedExcludedStarts:[],recurrence:{...event.recurrence,until:null}},anchor,addDays(anchor,7*event.recurrence.interval+1))[0]
  if(first)event={...event,start:first.start.toISOString(),end:first.end.toISOString()}
 }
 const time=(iso:string)=>({dateTime:iso,timeZone:'America/New_York'})
 const start=new PlannerDate(event.start),end=new PlannerDate(event.end)
 const payload:Record<string,any>={summary:event.title,description:event.description||'',start:event.allDay?{date:toDateInput(start)}:time(event.start),end:event.allDay?{date:toDateInput(addDays(end,1))}:time(event.reminder?new Date(Date.parse(event.start)+60000).toISOString():event.end)}
 if(!event.allDay&&Date.parse(payload.end.dateTime)<=Date.parse(event.start))throw Error('Fixed event needs an end after its start.')
 if(event.recurrence.frequency!=='none'){
  let rule='RRULE:FREQ='+(event.recurrence.frequency==='custom'?'WEEKLY':event.recurrence.frequency.toUpperCase())+';INTERVAL='+Math.max(1,event.recurrence.interval)
  if(event.recurrence.frequency==='custom'){const days=['SU','MO','TU','WE','TH','FR','SA'];rule+=';BYDAY='+[...new Set(event.recurrence.weekdays||[start.getDay()])].sort().map(day=>days[day]).join(',')+';WKST='+days[event.recurrence.weekStartsOn||0]}
  if(event.recurrence.until)rule+=';UNTIL='+(event.allDay?event.recurrence.until.replaceAll('-',''):new Date(endOfDateInput(event.recurrence.until).getTime()).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'))
  payload.recurrence=[rule,...[...new Set([...(event.excludedStarts||[]),...(event.inheritedExcludedStarts||[])])].map(value=>(event.allDay?'EXDATE;VALUE=DATE:':'EXDATE:')+(event.allDay?toDateInput(new PlannerDate(value)).replaceAll('-',''):new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')))]
 }else payload.recurrence=[]
 return payload
}
export function fixedFingerprint(event:CalendarEvent){return createHash('sha256').update(JSON.stringify(fixedEventPayload(event))).digest('hex')}
