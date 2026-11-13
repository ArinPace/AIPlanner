import { addMonths, getMonthGrid, isSameDay, isSameMonth, isToday, WEEKDAYS_SHORT } from '../lib/dates'
import { ChevronIcon } from './Icons'

type MiniCalendarProps = {
  cursor: Date
  onCursorChange: (date: Date) => void
  onMonthChange?: (date:Date)=>void
  selectedDate?: Date
}

export function MiniCalendar({ cursor, onCursorChange, onMonthChange=onCursorChange, selectedDate=cursor }: MiniCalendarProps) {
  const days = getMonthGrid(cursor)
  const label = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <span>{label}</span>
        <div className="nav-group">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => onMonthChange(addMonths(cursor, -1))}
          >
            <ChevronIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next month"
            onClick={() => onMonthChange(addMonths(cursor, 1))}
          >
            <ChevronIcon className="flip" />
          </button>
        </div>
      </div>
      <div className="mini-cal-grid">
        {WEEKDAYS_SHORT.map((day, index) => (
          <span key={`${day}-${index}`} className="mini-cal-dow">
            {day}
          </span>
        ))}
        {days.map((day) => {
          const outside = !isSameMonth(day, cursor)
          const selected = isSameDay(day, selectedDate)
          const today = isToday(day)
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={[
                'mini-cal-day',
                outside ? 'is-outside' : '',
                selected ? 'is-selected' : '',
                today ? 'is-today' : '',
              ].join(' ')}
              aria-label={day.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
              aria-pressed={selected}
              onClick={() => onCursorChange(day)}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
