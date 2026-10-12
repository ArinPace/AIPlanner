import type { Occurrence } from '../types'
import {
  endOfDay,
  getMonthGrid,
  isSameMonth,
  isToday,
  overlaps,
  startOfDay,
  WEEKDAYS_SHORT,
} from '../lib/dates'

type YearViewProps = {
  cursor: Date
  occurrences: Occurrence[]
  onMonthOpen: (date: Date) => void
  onDayOpen: (date: Date) => void
}

function monthCursor(year: number, month: number): Date {
  return new Date(year, month, 1)
}

export function YearView({ cursor, occurrences, onMonthOpen, onDayOpen }: YearViewProps) {
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
                const hasEvents = occurrences.some((item) =>
                  overlaps(item.start, item.end, startOfDay(day), endOfDay(day)),
                )
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={[
                      'year-day',
                      outside ? 'is-outside' : '',
                      today ? 'is-today' : '',
                      hasEvents ? 'has-events' : '',
                    ].join(' ')}
                    onClick={() => onDayOpen(day)}
                  >
                    {day.getDate()}
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
