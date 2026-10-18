import { PlannerDate as Date } from '../lib/timezone.js'
import type { Occurrence, Tag } from '../types'
import {yearDaySummary} from '../lib/yearCalendar'
import {
  getMonthGrid,
  isSameMonth,
  isToday,
  WEEKDAYS_SHORT,
} from '../lib/dates'

type YearViewProps = {
  cursor: Date
  occurrences: Occurrence[]
  tags: Tag[]
  hiddenTagIds: Set<string>
  onMonthOpen: (date: Date) => void
  onDayOpen: (date: Date) => void
}

function monthCursor(year: number, month: number): Date {
  return new Date(year, month, 1)
}

export function YearView({ cursor, occurrences, tags, hiddenTagIds, onMonthOpen, onDayOpen }: YearViewProps) {
  const year = cursor.getFullYear()
  const months = Array.from({ length: 12 }, (_, month) => monthCursor(year, month))

  return (
    <div className="year-view">
      {months.map((month) => {
        const days = getMonthGrid(month)
        const label = month.toLocaleDateString(undefined, { month: 'long' })
        return (
          <section key={month.toISOString()} className="year-month">
            <button type="button" className="year-month-title" onClick={() => onMonthOpen(month)}>
              {label}
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
