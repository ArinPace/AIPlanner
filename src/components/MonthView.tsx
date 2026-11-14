import {durationHeight} from '../lib/calendarDisplay'
import { freeTimeAppearance, withFreeTime, isFreeTimeRow } from '../lib/freeTime'
import { eventAppearance } from '../lib/eventAppearance'
import {PlannerDate as Date} from '../lib/timezone'
import { urgencyColor } from '../lib/urgencyColor'
import { Fragment,useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CalendarEvent, Tag, Occurrence } from '../types'
import { expandEvents } from '../lib/recurrence'
import {occurrenceFolderGroups} from '../lib/eventFolders'
import { eventColor } from '../lib/colors'
import {
  endOfDay,
  formatTimeCompact,
  addDays,
  startOfWeek,
  isSameMonth,
  isToday,
  startOfDay,
  WEEKDAYS,
} from '../lib/dates'

const TARGET_WEEK_HEIGHT = 112

type MonthViewProps = {
  onFreeTimeClick?: (item:Occurrence)=>void
  showFreeTime?:boolean
  scaleToDuration?:boolean
  cursor: Date
  zoom: number
  busyEvents: CalendarEvent[]
  events: CalendarEvent[]
  onMonthChange: (date: Date) => void
  tags: Tag[]
  onDayClick: (date: Date) => void
  onDayOpen: (date: Date) => void
  onEventClick: (event: CalendarEvent, occurrenceStart: Date) => void
}

export function MonthView({ onFreeTimeClick, showFreeTime=true, scaleToDuration=false,cursor, zoom, events, busyEvents, onMonthChange, tags, onDayClick, onDayOpen, onEventClick }: MonthViewProps) {
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer)},[])
  const scrollRef = useRef<HTMLDivElement>(null)
  const monthKey = cursor.getFullYear() + '-' + cursor.getMonth()
  const [range, setRange] = useState(() => ({ start: startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)), weeks: 18 }))
  const days = useMemo(() => Array.from({ length: range.weeks * 7 }, (_, index) => addDays(range.start, index)), [range])
  const rows = range.weeks
  const occurrences = useMemo(() => occurrenceFolderGroups(expandEvents(busyEvents, range.start, endOfDay(addDays(range.start, range.weeks * 7 - 1)))).top, [busyEvents, range])
  const visibleIds=useMemo(()=>new Set(events.map(event=>event.id)),[events])
  const busyOccurrences = occurrences
  const dayItems = useMemo(() => days.map(day => {
    const start = startOfDay(day).getTime(), end = endOfDay(day).getTime()
    return withFreeTime(occurrences.filter(item => item.start.getTime() < end && item.end.getTime() > start), busyOccurrences, startOfDay(day), addDays(startOfDay(day),1))
  }), [days, occurrences, busyOccurrences])
  const scrollFrame = useRef<number | null>(null)
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current) }, [])
  const reportedMonth = useRef<string | null>(null)
  const jumpedMonth = useRef<string | null>(null)
  const previousScale=useRef(scaleToDuration)
  const prependAnchor = useRef<{ day: string; top: number } | null>(null)

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    if(previousScale.current!==scaleToDuration){previousScale.current=scaleToDuration;jumpedMonth.current=null;reportedMonth.current=null}
    if (prependAnchor.current) {
      const anchor = prependAnchor.current
      const cell = node.querySelector<HTMLElement>('[data-day="' + anchor.day + '"]')
      if (cell) node.scrollTop += cell.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.top
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
  }, [monthKey, range, cursor,scaleToDuration])

  function updateScroll() {
    const node = scrollRef.current
    if (!node || prependAnchor.current) return
    const top = node.getBoundingClientRect().top
    const cells = node.querySelectorAll<HTMLElement>('[data-day]')
    let low = 0, high = rows - 1
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (cells[mid * 7].getBoundingClientRect().bottom > top + 30) high = mid
      else low = mid + 1
    }
    const day = cells[low * 7 + 6]?.dataset.day
    if (day) {
      const date = new Date(day)
      const key = date.getFullYear() + '-' + date.getMonth()
      if (key !== monthKey) {
        reportedMonth.current = key
        onMonthChange(new Date(date.getFullYear(), date.getMonth(), 1))
      }
    }
    if (node.scrollTop < 200) {
      prependAnchor.current = { day: cells[low * 7].dataset.day!, top: cells[low * 7].getBoundingClientRect().top - top }
      setRange(current => ({ start: addDays(current.start, -28), weeks: Math.min(26, current.weeks + 4) }))
    } else if (node.scrollHeight - node.scrollTop - node.clientHeight < 400) {
      prependAnchor.current = { day: cells[low * 7].dataset.day!, top: cells[low * 7].getBoundingClientRect().top - top }
      setRange(current => ({ start: current.weeks >= 26 ? addDays(current.start, 28) : current.start, weeks: Math.min(26, current.weeks + 4) }))
    }
  }

  function handleScroll() {
    if (scrollFrame.current !== null) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null
      updateScroll()
    })
  }

  return (
    <div className={'month-view'+(scaleToDuration?' is-duration-scaled':'')}>
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
        {days.map((day, index) => {
          const dayEvents = dayItems[index]
          const outside = !isSameMonth(day, cursor)
          const today=isToday(day),nextEvent=dayEvents.findIndex(item=>!item.event.allDay&&item.start.getTime()>now.getTime())
          const timeLine=<div className="month-now-line" role="img" aria-label={'Current time '+formatTimeCompact(now)} title={'Now · '+formatTimeCompact(now)}/>

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
                {dayEvents.map((item,eventIndex) => {
                  const color = eventColor(item.event, tags)
                  const filtered=(!showFreeTime&&isFreeTimeRow(item))||(!item.freeTime&&!visibleIds.has(item.event.id))
                  return (
                    <Fragment key={`${item.event.id}-${item.start.toISOString()}`}>
                    {today&&eventIndex===nextEvent&&timeLine}
                    <button
                      type="button"
                      className={`event-chip ${item.event.reminder?'reminder-event':''}${filtered?' is-filtered':''}`} aria-hidden={filtered?true:undefined} disabled={filtered}
                      title={item.event.title}
                      style={{...(item.freeTime?freeTimeAppearance:eventAppearance(color,item.event.reminder)),...(scaleToDuration?{height:durationHeight(item,'month',zoom,startOfDay(day).getTime(),addDays(startOfDay(day),1).getTime())}:{})}}
                      onClick={(event) => {
                        event.stopPropagation()
                        if(item.freeTime){if(onFreeTimeClick)onFreeTimeClick(item);else onDayClick(item.start)}
                        else onEventClick(item.event, item.start)
                      }}
                    >
                      {!item.event.allDay && <span className="event-time">{formatTimeCompact(item.start)}</span>}
                      <span className="event-title">{item.event.urgency!=null && <span className="event-urgency-badge" style={urgencyColor(item.event.urgency)} aria-label={'Urgency '+item.event.urgency}>{item.event.urgency}</span>}{item.event.title || '(No title)'}</span>
                    </button>
                    </Fragment>
                  )
                })}
                {today&&nextEvent===-1&&timeLine}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
