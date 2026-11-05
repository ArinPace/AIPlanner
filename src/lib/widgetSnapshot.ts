import type { CalendarEvent, Tag } from '../types.js'
import {eventType} from './eventType.js'
import {eventColor} from './colors.js'
import { expandEvents } from './recurrence.js'
import { PlannerDate } from './timezone.js'
export function widgetSnapshot(events: CalendarEvent[], now = new Date(), tags: Tag[] = [], resolvedFeedbackIds: string[] = []) {
  const until = new Date(now.getTime() + 7 * 86400000)
  const occurrences=expandEvents(events,new PlannerDate(now),new PlannerDate(until)).filter(({event,start,end})=>!event.allDay&&!event.reminder&&end>start)
  return { focusWindows:occurrences.map(({event,start,end})=>({id:event.id+'@'+start.toISOString(),sourceEventId:event.detachedFrom||event.id,title:event.title.slice(0,300),start:start.getTime()/1000,end:end.getTime()/1000})), resolvedFeedbackIds, version: 1, generatedAt: now.getTime() / 1000, validUntil: until.getTime() / 1000,
    events: occurrences
      .filter(({event})=>event.eventKind!=='folder')
      .map(({ event, start, end }) => {
        const isFreeTime = event.title.trim().toLowerCase() === 'free time' && eventType(event, tags) === 'planned'
        return { id: event.id + '@' + start.toISOString(), title: event.title.slice(0, 300), planningTaskId: event.planning?.taskId, sourceEventId: event.detachedFrom || event.id, isFreeTime, color: isFreeTime ? '#ffffff' : eventColor(event, tags), start: start.getTime() / 1000, end: end.getTime() / 1000 }
      }) }
}
