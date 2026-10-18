import { eventAppearance } from '../lib/eventAppearance'
import { urgencyColor } from '../lib/urgencyColor'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CalendarEvent, Tag } from '../types'
import { expandEvents } from '../lib/recurrence'
import { eventColor } from '../lib/colors'
import {
  endOfDay,
  formatTimeCompact,
  addDays,
  startOfWeek,
  isSameMonth,
  isToday,
  overlaps,
  startOfDay,
  WEEKDAYS,
} from '../lib/dates'

const TARGET_WEEK_HEIGHT = 112

type MonthViewProps = {
  cursor: Date
  zoom: number
  events: CalendarEvent[]
  onMonthChange: (date: Date) => void
  tags: Tag[]
  onDayClick: (date: Date) => void
  onDayOpen: (date: Date) => void
  onEventClick: (event: CalendarEvent, occurrenceStart: Date) => void
}

export function MonthView({ cursor, zoom, events, onMonthChange, tags, onDayClick, onDayOpen, onEventClick }: MonthViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const monthKey = cursor.getFullYear() + '-' + cursor.getMonth()
  const [range, setRange] = useState(() => ({ start: startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)), weeks: 18 }))
  const days = Array.from({ length: range.weeks * 7 }, (_, index) => addDays(range.start, index))
  const rows = range.weeks
  const occurrences = useMemo(() => expandEvents(events, range.start, endOfDay(addDays(range.start, range.weeks * 7 - 1))), [events, range])
  const reportedMonth = useRef<string | null>(null)
  const jumpedMonth = useRef<string | null>(null)
  const prependAnchor = useRef<{ height: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    if (prependAnchor.current) {
      const anchor = prependAnchor.current
      node.scrollTop = anchor.top + node.scrollHeight - anchor.height
      prependAnchor.current = null
    }
    if (reportedMonth.current === monthKey) {
      reportedMonth.current = null
      jumpedMonth.current = monthKey
      return
    }
    if (jumpedMonth.current === monthKey) return
    const target = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
    const cell = node.querySelector<HTMLElement>('[data-day="' + target.toISOString() + '"]')
    if (!cell) {
      setRange({ start: startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)), weeks: 18 })
      return
    }
    jumpedMonth.current = monthKey
    node.scrollTop += cell.getBoundingClientRect().top - node.getBoundingClientRect().top
  }, [monthKey, range, cursor])

  function handleScroll() {
    const node = scrollRef.current
    if (!node || prependAnchor.current) return
    const top = node.getBoundingClientRect().top
    const cells = Array.from(node.querySelectorAll<HTMLElement>('[data-day]'))
    const firstRow = cells.findIndex((cell, index) => index % 7 === 0 && cell.getBoundingClientRect().bottom > top + 30)
    const day = firstRow >= 0 ? cells[firstRow + 6]?.dataset.day : undefined
    if (day) {
      const date = new Date(day)
      const key = date.getFullYear() + '-' + date.getMonth()
      if (key !== monthKey) {
        reportedMonth.current = key
        onMonthChange(new Date(date.getFullYear(), date.getMonth(), 1))
      }
    }
    if (node.scrollTop < 200) {
      prependAnchor.current = { height: node.scrollHeight, top: node.scrollTop }
      setRange(current => ({ start: addDays(current.start, -28), weeks: current.weeks + 4 }))
    } else if (node.scrollHeight - node.scrollTop - node.clientHeight < 400) {
      setRange(current => ({ ...current, weeks: current.weeks + 4 }))
    }
  }

  return (
    <div className="month-view">
      <div className="month-dow">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="month-scroll" ref={scrollRef} onScroll={handleScroll}>
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
              data-day={day.toISOString()}
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
                {day.getDate() === 1 ? day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : day.getDate()}
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
