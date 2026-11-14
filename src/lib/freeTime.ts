import { PlannerDate } from './timezone.js'
import type { Occurrence } from '../types.js'

export const FREE_TIME_TAG_ID='__free_time__'
export function isFreeTimeRow(row:Occurrence&{freeTime?:true}){return Boolean(row.freeTime)||row.event.title.trim().toLowerCase()==='free time'||Boolean(row.event.completedStarts?.some(value=>Date.parse(value)===row.start.getTime()))}
export type ScheduleRow = Occurrence & { freeTime?: true }
export const freeTimeAppearance = { background: 'var(--calendar-free-fill, #fff)', color: 'var(--calendar-free-text, #000)', border: '1px solid var(--calendar-free-border, #000)' }

/** Display-only gaps: never saved as events or sent to external calendars. */
export function freeTimeGaps(busy: Occurrence[], start: Date, end: Date): ScheduleRow[] {
  const intervals = busy.filter(item => !item.event.allDay && !item.event.reminder && item.end > start && item.start < end)
    .map(item => ({ start: Math.max(start.getTime(), item.start.getTime()), end: Math.min(end.getTime(), item.end.getTime()) }))
    .filter(item => item.end > item.start).sort((a, b) => a.start - b.start)
  const gaps: ScheduleRow[] = []
  function append(from: number, to: number) {
    if (to <= from) return
    const gapStart = new PlannerDate(from), gapEnd = new PlannerDate(to)
    gaps.push({ freeTime: true, start: gapStart, end: gapEnd, event: {
      id: `free-time:${from}:${to}`, title: 'Free time', description: '',
      start: gapStart.toISOString(), end: gapEnd.toISOString(), allDay: false,
      tagIds: [], recurrence: { frequency: 'none', interval: 1, until: null },
    } })
  }
  let cursor = start.getTime()
  for (const interval of intervals) {
    append(cursor, interval.start)
    cursor = Math.max(cursor, interval.end)
  }
  append(cursor, end.getTime())
  return gaps
}

export function withFreeTime(visible: Occurrence[], busy: Occurrence[], start: Date, end: Date): ScheduleRow[] {
  return [...visible, ...freeTimeGaps(busy, start, end)].sort((a, b) =>
    Number(b.event.allDay) - Number(a.event.allDay) || a.start.getTime() - b.start.getTime())
}
