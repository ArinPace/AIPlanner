import { PlannerDate as Date } from '../lib/timezone.js'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CalendarEvent, Tag } from '../types'
import { expandEvents } from '../lib/recurrence'
import {occurrenceFolderGroups} from '../lib/eventFolders'
import {yearDaySummary} from '../lib/yearCalendar'
import {
  getMonthGrid,
  isSameMonth,
  isToday,
  WEEKDAYS_SHORT,
} from '../lib/dates'

type YearViewProps = {
  cursor: Date
  events: CalendarEvent[]
  tags: Tag[]
  hiddenTagIds: Set<string>
  onMonthOpen: (date: Date) => void
  onDayOpen: (date: Date) => void
}

function monthCursor(year: number, month: number): Date {
  return new Date(year, month, 1)
}

export function YearView({ cursor, events, tags, hiddenTagIds, onMonthOpen, onDayOpen }: YearViewProps) {
  const year = cursor.getFullYear()
  const [years, setYears] = useState({ start: year - 1, end: year + 1 })
  const months = Array.from({ length: (years.end - years.start + 1) * 12 }, (_, month) => monthCursor(years.start, month))
  const occurrences = useMemo(() => occurrenceFolderGroups(expandEvents(events, monthCursor(years.start, 0), monthCursor(years.end + 1, 0))).top, [events, years.start, years.end])
  const viewRef = useRef<HTMLDivElement>(null)
  const prependAnchor = useRef<{ height: number; top: number } | null>(null)
  const currentMonthRef = useRef<HTMLElement>(null)
  const currentMonth = new Date().getMonth()

  useLayoutEffect(() => {
    const view = viewRef.current
    const month = currentMonthRef.current
    if (!view || !month) return
    view.scrollTop += month.getBoundingClientRect().top - view.getBoundingClientRect().top
  }, [year, currentMonth])

  useLayoutEffect(() => {
    const view = viewRef.current
    const anchor = prependAnchor.current
    if (view && anchor) {
      view.scrollTop = anchor.top + view.scrollHeight - anchor.height
      prependAnchor.current = null
    }
  }, [years.start])

  return (
    <div className="year-view" ref={viewRef} onScroll={() => {
      const view = viewRef.current
      if (!view || prependAnchor.current) return
      if (view.scrollTop < 200) {
        prependAnchor.current = { height: view.scrollHeight, top: view.scrollTop }
        setYears(current => ({ ...current, start: current.start - 1 }))
      } else if (view.scrollHeight - view.scrollTop - view.clientHeight < 400) {
        setYears(current => ({ ...current, end: current.end + 1 }))
      }
    }}>
      {months.map((month) => {
        const days = getMonthGrid(month)
        const label = month.toLocaleDateString(undefined, { month: 'long' })
        return (
          <section key={month.toISOString()} className="year-month" ref={month.getFullYear() === year && month.getMonth() === currentMonth ? currentMonthRef : undefined}>
            <button type="button" className="year-month-title" onClick={() => onMonthOpen(month)}>
              {label} {month.getFullYear()}
            </button>
            <div className="year-month-grid">
              {WEEKDAYS_SHORT.map((day, index) => (
                <span key={`${day}-${index}`} className="year-dow">
                  {day}
                </span>
              ))}
              {days.map((day) => {
                const outside = !isSameMonth(day, month)
                const today = isToday(day)
                const summary=outside?{count:0,segments:[]}:yearDaySummary(day,occurrences,tags,hiddenTagIds)
                const dateLabel=day.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})
                const label=dateLabel+(summary.count?` — ${summary.count} ${summary.count===1?'event':'events'}: ${summary.segments.map(segment=>segment.label).join(', ')}`:'')
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={[
                      'year-day',
                      outside ? 'is-outside' : '',
                      today ? 'is-today' : '',
                      summary.count ? 'has-events' : '',
                    ].join(' ')}
                    onClick={() => onDayOpen(day)}
                    aria-label={label}
                    title={label}
                  >
                    <span>{day.getDate()}</span>
                    {summary.segments.length>0&&<span className="year-event-bar" aria-hidden="true">{summary.segments.map(segment=><span key={segment.color} style={{backgroundColor:segment.color}}/>)}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
