import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent, Occurrence, Tag } from '../types'
import { contrastText, eventColor } from '../lib/colors'
import {
  endOfDay,
  formatTimeCompact,
  getFilledMonthGrid,
  getMonthGrid,
  isSameMonth,
  isToday,
  overlaps,
  startOfDay,
  WEEKDAYS,
} from '../lib/dates'
import { RepeatIcon } from './Icons'

const TARGET_WEEK_HEIGHT = 112

type MonthViewProps = {
  cursor: Date
  zoom: number
  occurrences: Occurrence[]
  tags: Tag[]
  onDayClick: (date: Date) => void
  onDayOpen: (date: Date) => void
  onEventClick: (event: CalendarEvent, occurrenceStart: Date) => void
}

export function MonthView({ cursor, zoom, occurrences, tags, onDayClick, onDayOpen, onEventClick }: MonthViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const monthWeeks = getMonthGrid(cursor).length / 7
  const [weekCount, setWeekCount] = useState(Math.max(6, monthWeeks))
  const days = getFilledMonthGrid(cursor, weekCount)
  const rows = days.length / 7
  const maxVisible = Math.max(2, Math.round(3 * zoom))

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const measure = () => {
      const fitted = Math.floor(node.clientHeight / TARGET_WEEK_HEIGHT)
      setWeekCount(Math.max(monthWeeks, fitted))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [monthWeeks])

  return (
    <div className="month-view">
      <div className="month-dow">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="month-scroll" ref={scrollRef}>
        <div
          className="month-grid"
          style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
        {days.map((day) => {
          const dayEvents = occurrences.filter((item) =>
            overlaps(item.start, item.end, startOfDay(day), endOfDay(day)),
          )
          const visible = dayEvents.slice(0, maxVisible)
          const extra = dayEvents.length - visible.length
          const outside = !isSameMonth(day, cursor)

          return (
            <div
              key={day.toISOString()}
              className={`month-cell ${outside ? 'is-outside' : ''} ${isToday(day) ? 'is-today' : ''}`}
              onClick={() => onDayClick(day)}
            >
              <button
                type="button"
                className={`month-date ${isToday(day) ? 'is-today' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onDayOpen(day)
                }}
              >
                {day.getDate()}
              </button>
              <div className="month-events">
                {visible.map((item) => {
                  const color = eventColor(item.event, tags)
                  return (
                    <button
                      key={`${item.event.id}-${item.start.toISOString()}`}
                      type="button"
                      className="event-chip"
                      style={{ background: color, color: contrastText(color) }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEventClick(item.event, item.start)
                      }}
                    >
                      {item.event.recurrence.frequency !== 'none' && <RepeatIcon />}
                      {!item.event.allDay && <span className="event-time">{formatTimeCompact(item.start)}</span>}
                      <span className="event-title">{item.event.title || '(No title)'}</span>
                    </button>
                  )
                })}
                {extra > 0 && (
                  <button
                    type="button"
                    className="more-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDayOpen(day)
                    }}
                  >
                    {extra} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
