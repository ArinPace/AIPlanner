import { eventAppearance } from '../lib/eventAppearance'
import { urgencyColor } from '../lib/urgencyColor'
import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent, Occurrence, Tag } from '../types'
import { eventColor } from '../lib/colors'
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
          style={{ gridTemplateRows: `repeat(${rows}, minmax(${TARGET_WEEK_HEIGHT * Math.max(1, zoom)}px, auto))`, minHeight: rows * TARGET_WEEK_HEIGHT * Math.max(1, zoom) }}
        >
        {days.map((day) => {
          const dayEvents = occurrences.filter((item) =>
            overlaps(item.start, item.end, startOfDay(day), endOfDay(day)),
          )
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
                {dayEvents.map((item) => {
                  const color = eventColor(item.event, tags)
                  return (
                    <button
                      key={`${item.event.id}-${item.start.toISOString()}`}
                      type="button"
                      className={`event-chip ${item.event.reminder?'reminder-event':''}`}
                      style={eventAppearance(color,item.event.reminder)}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEventClick(item.event, item.start)
                      }}
                    >
                      {item.event.recurrence.frequency !== 'none' && <RepeatIcon />}
                      {!item.event.allDay && <span className="event-time">{formatTimeCompact(item.start)}</span>}
                      <span className="event-title">{item.event.urgency!=null && <span className="event-urgency-badge" style={urgencyColor(item.event.urgency)} aria-label={'Urgency '+item.event.urgency}>{item.event.urgency}</span>}{item.event.title || '(No title)'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
