import { eventAppearance } from '../lib/eventAppearance'
import { PlannerDate as Date } from '../lib/timezone.js'
import { urgencyColor } from '../lib/urgencyColor'
import { useEffect, useRef } from 'react'
import type { CalendarEvent, CalendarView, Occurrence, Tag } from '../types'
import { eventColor } from '../lib/colors'
import {
  addDays,
  endOfDay,
  formatHour,
  formatTimeCompact,
  getWeekDays,
  isToday,
  overlaps,
  startOfDay,
} from '../lib/dates'
import {layoutTimeCards} from '../lib/timeLayout'
import {PlanningButton} from './PlanningSettings'
import {toDateInput} from '../lib/dates'

type TimeGridViewProps = {
  cursor: Date
  view: Extract<CalendarView, 'week' | 'day'>
  zoom: number
  occurrences: Occurrence[]
  tags: Tag[]
  onSlotClick: (date: Date, allDay?: boolean) => void
  onEventClick: (event: CalendarEvent, occurrenceStart: Date) => void
}

const BASE_HOUR_HEIGHT = 48
const HOURS = Array.from({ length: 24 }, (_, index) => index)

function clipToDay(item: Occurrence, day: Date): { start: Date; end: Date } | null {
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  if (!overlaps(item.start, item.end, dayStart, dayEnd)) return null
  return {
    start: item.start < dayStart ? dayStart : item.start,
    end: item.end > dayEnd ? dayEnd : item.end,
  }
}

export function TimeGridView({ cursor, view, zoom, occurrences, tags, onSlotClick, onEventClick }: TimeGridViewProps) {
  const days = view === 'day' ? [startOfDay(cursor)] : getWeekDays(cursor)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevZoom = useRef(zoom)
  const bodyRef=useRef<HTMLDivElement>(null)
  const hourHeight = Math.round(BASE_HOUR_HEIGHT * zoom)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = 8 * hourHeight - 16
  }, [view, cursor])

  useEffect(() => {
    const node = scrollRef.current
    if (!node || prevZoom.current === zoom) return
    const oldHeight = BASE_HOUR_HEIGHT * prevZoom.current
    const nextHeight = BASE_HOUR_HEIGHT * zoom
    const midpoint = node.scrollTop + node.clientHeight / 2
    node.scrollTop = (midpoint / oldHeight) * nextHeight - node.clientHeight / 2
    prevZoom.current = zoom
  }, [zoom])

  const now = new Date()
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight

  return (
    <div className={`time-view-scroll ${view === 'week' ? 'has-mobile-week' : ''}`}>
      {view === 'week' && <div className="mobile-week">
        {days.map(day => {
          const items = occurrences.filter(item => clipToDay(item, day)).sort((a, b) =>
            Number(b.event.allDay) - Number(a.event.allDay) || a.start.getTime() - b.start.getTime())
          return <section className="mobile-week-day" key={day.toISOString()}>
            <div className="mobile-week-heading">
              <h3 className={isToday(day) ? 'is-today' : ''}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <PlanningButton date={toDateInput(day)}/>
              <button type="button" className="text-btn" aria-label={'Add event on ' + day.toDateString()} onClick={() => onSlotClick(startOfDay(day), true)}>+</button>
            </div>
            {items.length === 0 && <p className="mobile-week-empty">No events</p>}
            {items.map(item => <button
              type="button" key={item.event.id + item.start.toISOString()}
              className="event-chip mobile-week-event"
              title={item.event.title || '(No title)'}
              style={eventAppearance(eventColor(item.event, tags), item.event.reminder)}
              onClick={() => onEventClick(item.event, item.start)}
            >
              <span className="mobile-week-time">{item.event.allDay ? (item.event.reminder ? 'Reminder' : 'All day') : formatTimeCompact(clipToDay(item, day)!.start)}</span>
              <span className="event-title">{item.event.urgency != null && <span className="event-urgency-badge" style={urgencyColor(item.event.urgency)} aria-label={'Urgency ' + item.event.urgency}>{item.event.urgency}</span>}{item.event.title || '(No title)'}</span>
            </button>)}
          </section>
        })}
      </div>}
      <div className={`time-view is-${view}`}>
      <div className={`time-header days-${days.length}`}>
        <div className="gutter" />
        {days.map((day) => (
          <div key={day.toISOString()} className={`time-day-head ${isToday(day) ? 'is-today' : ''}`}>
            <span className="dow">{day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
            <span className="num">{day.getDate()}</span>
            {view==='day'&&<PlanningButton date={toDateInput(day)}/>}
          </div>
        ))}
      </div>

      <div className={`all-day-row days-${days.length}`}>
        <div className="gutter">All day</div>
        {days.map((day) => {
          const items = occurrences.filter((item) => item.event.allDay && clipToDay(item, day))
          return (
            <div key={day.toISOString()} className="all-day-cell" onClick={() => onSlotClick(startOfDay(day), true)}>
              {items.map((item) => {
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
                    <span className="event-title">{item.event.urgency!=null && <span className="event-urgency-badge" style={urgencyColor(item.event.urgency)} aria-label={'Urgency '+item.event.urgency}>{item.event.urgency}</span>}{item.event.title || '(No title)'}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="time-scroll" ref={scrollRef}>
        <div ref={bodyRef} className={`time-body days-${days.length}`} style={{ height: 24 * hourHeight, marginBottom: 90 }}>
          <div className="hours">
            {HOURS.map((hour) => (
              <div key={hour} className="hour-label" style={{ height: hourHeight }}>
                {hour === 0 ? '' : formatHour(hour)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const timed = occurrences.filter((item) => !item.event.allDay && clipToDay(item, day))
            const laidOut = layoutTimeCards(timed.map(item=>{
              const clipped=clipToDay(item,day)!
              const top=(clipped.start.getHours()*60+clipped.start.getMinutes()+clipped.start.getSeconds()/60)/60*hourHeight
              const endMinutes=clipped.end.getTime()===addDays(startOfDay(day),1).getTime()?1440:clipped.end.getHours()*60+clipped.end.getMinutes()+clipped.end.getSeconds()/60
              const startMinutes=clipped.start.getHours()*60+clipped.start.getMinutes()+clipped.start.getSeconds()/60
              const height=Math.max((endMinutes-startMinutes)/60*hourHeight,1)
              const key=day.toDateString()+'/'+item.event.id+'/'+item.start.toISOString()
              return {item,key,top,height,bottom:top+height}
            }))
            const showNow = isToday(day)

            return (
              <div key={day.toISOString()} className="day-col">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className="hour-slot"
                    style={{ height: hourHeight }}
                    aria-label={`${formatHour(hour)} on ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                    onClick={() =>
                      onSlotClick(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0))
                    }
                  />
                ))}

                {showNow && <div className="now-line" style={{ top: nowTop }} />}

                {laidOut.map(({item,key,top,height,col,cols}) => {
                  const width = `calc((100% - 8px) / ${cols})`
                  const left = `calc(4px + ${col} * (100% - 8px) / ${cols})`
                  const color = eventColor(item.event, tags)

                  return (
                    <button
                      key={`${item.event.id}-${item.start.toISOString()}`}
                      type="button"
                      className={`timed-event ${item.event.reminder?'reminder-event':''} ${height<32?'is-short':''}`} 
                      data-layout-key={key}
                      title={`${item.event.reminder?'Reminder: ':''}${item.event.title} - ${formatTimeCompact(item.start)}${item.event.reminder?'':' - '+formatTimeCompact(item.end)}`}
                      style={{
                        top,
                        height,
                        minHeight:0,
                        maxHeight:height,
                        width,
                        left,
                        ...eventAppearance(color,item.event.reminder),
                      }}
                      onClick={() => onEventClick(item.event, item.start)}
                    >
                      <span className="event-title">
                        {item.event.urgency!=null && <span className="event-urgency-badge" style={urgencyColor(item.event.urgency)} aria-label={'Urgency '+item.event.urgency}>{item.event.urgency}</span>}
                        {item.event.title || '(No title)'}
                      </span>
                      <span className="event-time">{item.event.reminder?'Reminder \u00b7 '+formatTimeCompact(item.start):formatTimeCompact(item.start)+' \u2013 '+formatTimeCompact(item.end)}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div></div>
  )
}
