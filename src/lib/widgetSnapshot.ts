import type { CalendarEvent } from '../types'
import { expandEvents } from './recurrence'
import { PlannerDate } from './timezone'
export function widgetSnapshot(events: CalendarEvent[], now = new Date()) {
  const until = new Date(now.getTime() + 7 * 86400000)
  return { version: 1, generatedAt: now.getTime() / 1000, validUntil: until.getTime() / 1000,
    events: expandEvents(events, new PlannerDate(now), new PlannerDate(until))
      .filter(({ event, start, end }) => !event.allDay && !event.reminder && event.eventKind !== 'folder' && end > start)
      .map(({ event, start, end }) => ({ id: event.id + '@' + start.toISOString(), title: event.title.slice(0, 300), start: start.getTime() / 1000, end: end.getTime() / 1000 })) }
}
