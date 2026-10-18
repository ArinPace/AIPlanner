import type { CalendarView } from '../types.js'

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

export function cloneDate(date: Date): Date {
  return new Date(date.getTime())
}

export function startOfDay(date: Date): Date {
  const next = cloneDate(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfDay(date: Date): Date {
  const next = cloneDate(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function startOfWeek(date: Date): Date {
  const next = startOfDay(date)
  next.setDate(next.getDate() - next.getDay())
  return next
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addDays(date: Date, amount: number): Date {
  const next = cloneDate(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function addMonths(date: Date, amount: number): Date {
  const next = cloneDate(date)
  const day = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + amount)
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, maxDay))
  return next
}

export function addYears(date: Date, amount: number): Date {
  return addMonths(date, amount * 12)
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999)
}

export function isSameYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000)
}

export function getMonthGrid(cursor: Date): Date[] {
  const first = startOfMonth(cursor)
  const gridStart = startOfWeek(first)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const gridEnd = addDays(startOfWeek(last), 6)
  const count = daysBetween(gridStart, gridEnd) + 1
  return Array.from({ length: count }, (_, index) => addDays(gridStart, index))
}

export function getFilledMonthGrid(cursor: Date, weekCount: number): Date[] {
  const start = startOfWeek(startOfMonth(cursor))
  const weeks = Math.max(weekCount, getMonthGrid(cursor).length / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index))
}

export function getWeekDays(cursor: Date): Date[] {
  const start = startOfWeek(cursor)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function combineDateAndTime(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hours, minutes] = timeValue.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

export function startOfDateInput(dateValue: string): Date {
  const [year, month, day] = dateValue.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

export function endOfDateInput(dateValue: string): Date {
  const [year, month, day] = dateValue.split('-').map(Number)
  return new Date(year, month - 1, day, 23, 59, 59, 999)
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function formatWeekdayLong(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

export function formatDayHeading(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatTimeCompact(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const hour12 = hours % 12 || 12
  const suffix = hours < 12 ? 'am' : 'pm'
  return minutes === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour < 12) return `${hour} AM`
  return `${hour - 12} PM`
}

export function formatRangeLabel(cursor: Date, view: CalendarView): string {
  if (view === 'year') return String(cursor.getFullYear())
  if (view === 'month') return formatMonthYear(cursor)
  if (view === 'day') return formatDayHeading(cursor)

  const start = startOfWeek(cursor)
  const end = addDays(start, 6)
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' })
  const endMonth = end.toLocaleDateString(undefined, { month: 'short' })

  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
    }
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`
  }

  return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`
}

export function visibleRange(cursor: Date, view: CalendarView): { start: Date; end: Date } {
  if (view === 'day') {
    return { start: startOfDay(cursor), end: endOfDay(cursor) }
  }
  if (view === 'week') {
    const start = startOfWeek(cursor)
    return { start, end: endOfDay(addDays(start, 6)) }
  }
  if (view === 'year') {
    const start = startOfWeek(startOfYear(cursor))
    const last = new Date(cursor.getFullYear(), 11, 31)
    return { start, end: endOfDay(addDays(startOfWeek(last), 6)) }
  }
  const days = getFilledMonthGrid(cursor, 16)
  const firstDay = days[0] ?? startOfMonth(cursor)
  const lastDay = days[days.length - 1] ?? firstDay
  return { start: startOfDay(firstDay), end: endOfDay(lastDay) }
}
