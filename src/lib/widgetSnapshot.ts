import {startOfDay,addDays} from './dates.js'
import {FREE_TIME_TAG_ID,freeTimeGaps} from './freeTime.js'
import {occurrenceChecked} from './eventChecklist.js'
import type { CalendarEvent, Tag } from '../types.js'
import {eventType} from './eventType.js'
import {eventColor} from './colors.js'
import { expandEvents } from './recurrence.js'
import { PlannerDate } from './timezone.js'
export function widgetSnapshot(events: CalendarEvent[], now = new Date(), tags: Tag[] = [], resolvedFeedbackIds: string[] = []) {
  const until = new Date(now.getTime() + 7 * 86400000)
  const occurrences=expandEvents(events,new PlannerDate(now),new PlannerDate(until)).filter(({event,start,end})=>!event.allDay&&!event.reminder&&end>start)
  const byId=new Map(events.map(event=>[event.id,event]))
  function inheritedTags(event:CalendarEvent){const ids=new Set(event.tagIds),seen=new Set<string>();let parent=event.folderId;while(parent&&!seen.has(parent)){seen.add(parent);const folder=byId.get(parent);folder?.tagIds.forEach(id=>ids.add(id));parent=folder?.folderId}return [...ids]}
  const dayStart=startOfDay(new PlannerDate(now))
  const freeBusy=expandEvents(events,dayStart,addDays(dayStart,7)).filter(({event})=>event.eventKind!=='folder')
  const freeWindows=Array.from({length:7},(_,index)=>addDays(dayStart,index)).flatMap(day=>freeTimeGaps(freeBusy,day,addDays(day,1))).filter(({end})=>end>now).map(({event,start,end})=>({id:event.id+'@'+start.toISOString(),sourceEventId:event.id,title:'Free time',start:start.getTime()/1000,end:end.getTime()/1000,tagIds:[FREE_TIME_TAG_ID]}))
  const completedWindows=occurrences.filter(({event,start})=>event.eventKind!=='folder'&&occurrenceChecked(event,start)).map(({event,start,end})=>({id:'free-time:completed:'+event.id+'@'+start.toISOString(),sourceEventId:'free-time:completed:'+event.id,title:'Free time',start:start.getTime()/1000,end:end.getTime()/1000,tagIds:[FREE_TIME_TAG_ID]}))
  return { focusWindows:[...occurrences.filter(({event,start}) => !occurrenceChecked(event,start)).map(({event,start,end})=>({id:event.id+'@'+start.toISOString(),sourceEventId:event.detachedFrom||event.id,title:event.title.slice(0,300),tagIds:event.title.trim().toLowerCase()==='free time'?[...inheritedTags(event),FREE_TIME_TAG_ID]:inheritedTags(event),start:start.getTime()/1000,end:end.getTime()/1000})),...freeWindows,...completedWindows], resolvedFeedbackIds, version: 1, generatedAt: now.getTime() / 1000, validUntil: until.getTime() / 1000,
    events: occurrences
      .filter(({event})=>event.eventKind!=='folder')
      .map(({ event, start, end }) => {
        const completed = occurrenceChecked(event, start)
        const isFreeTime = completed || event.title.trim().toLowerCase() === 'free time' && eventType(event, tags) === 'planned'
        return { id: event.id + '@' + start.toISOString(), title: completed ? 'Free time' : event.title.slice(0, 300), planningTaskId: completed ? undefined : event.planning?.taskId, sourceEventId: event.detachedFrom || event.id, isFreeTime, color: isFreeTime ? '#ffffff' : eventColor(event, tags), start: start.getTime() / 1000, end: end.getTime() / 1000 }
      }) }
}
