import type { CalendarEvent, Occurrence, Recurrence } from '../types.js'
import { addDays, addMonths, addYears, daysBetween, endOfDateInput, overlaps } from './dates.js'

function nextOccurrence(date: Date, recurrence: Recurrence): Date {
  switch (recurrence.frequency) {
    case 'daily':
      return addDays(date, recurrence.interval)
    case 'weekly':
      return addDays(date, 7 * recurrence.interval)
    case 'monthly':
      return addMonths(date, recurrence.interval)
    case 'yearly':
      return addYears(date, recurrence.interval)
    default:
      return addDays(date, 1)
  }
}

function firstOnOrAfter(eventStart: Date, rangeStart: Date, recurrence: Recurrence): Date {
  if (eventStart >= rangeStart) return eventStart

  if (recurrence.frequency === 'daily' || recurrence.frequency === 'weekly') {
    const stepDays = recurrence.frequency === 'weekly' ? 7 * recurrence.interval : recurrence.interval
    const distance = daysBetween(eventStart, rangeStart)
    const steps = Math.ceil(distance / stepDays)
    let candidate = addDays(eventStart, steps * stepDays)
    if (candidate < rangeStart) candidate = addDays(candidate, stepDays)
    return candidate
  }

  const jump =
    recurrence.frequency === 'yearly'
      ? addYears(eventStart, Math.max(0, rangeStart.getFullYear() - eventStart.getFullYear()))
      : addMonths(
          eventStart,
          Math.max(
            0,
            (rangeStart.getFullYear() - eventStart.getFullYear()) * 12 +
              (rangeStart.getMonth() - eventStart.getMonth()),
          ),
        )

  let current = jump < eventStart ? eventStart : jump
  let guard = 0
  while (current < rangeStart && guard < 2400) {
    current = nextOccurrence(current, recurrence)
    guard += 1
  }
  return current
}

export function expandEvent(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const eventStart = new Date(event.start)
  const eventEnd = new Date(event.end)
  const duration = event.reminder && !event.allDay ? 1 : Math.max(eventEnd.getTime() - eventStart.getTime(), 60_000)
  const until = event.recurrence.until ? endOfDateInput(event.recurrence.until) : null

  if (event.recurrence.frequency === 'none') {
    if (!overlaps(eventStart, eventEnd, rangeStart, rangeEnd)) return []
    return [{ event, start: eventStart, end: eventEnd }]
  }

  const occurrences: Occurrence[] = []
  let current = firstOnOrAfter(eventStart, rangeStart, event.recurrence)
  let guard = 0

  while (current <= rangeEnd && guard < 800) {
    if (until && current > until) break
    const end = new Date(current.getTime() + duration)
    if (overlaps(current, end, rangeStart, rangeEnd)) {
      occurrences.push({ event, start: current, end })
    }
    current = nextOccurrence(current, event.recurrence)
    guard += 1
  }

  return occurrences
}

export function expandEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  return events
    .flatMap((event) => expandEvent(event, rangeStart, rangeEnd))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
}

export function recurrenceLabel(recurrence: Recurrence): string {
  if (recurrence.frequency === 'none') return 'Does not repeat'

  const interval = recurrence.interval
  const unit = {
    daily: interval === 1 ? 'day' : 'days',
    weekly: interval === 1 ? 'week' : 'weeks',
    monthly: interval === 1 ? 'month' : 'months',
    yearly: interval === 1 ? 'year' : 'years',
  }[recurrence.frequency]

  const every = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}`
  return recurrence.until ? `${every} until ${recurrence.until}` : every
}
