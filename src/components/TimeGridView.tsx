import { useEffect, useRef, useState, useMemo } from 'react'
import type { CalendarEvent, CalendarView, Occurrence, Tag } from '../types'
import { contrastText, eventColor } from '../lib/colors'
import {
  endOfDay,
  formatHour,
  formatTimeCompact,
  getWeekDays,
  isToday,
  overlaps,
  startOfDay,
} from '../lib/dates'
import { RepeatIcon } from './Icons'
import {layoutTimeCards} from '../lib/timeLayout'

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
  const [cardHeights,setCardHeights]=useState<Record<string,number>>({})
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

  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setCardHeights(current=>{
      let next=current
      for(const entry of entries){const key=(entry.target as HTMLElement).dataset.layoutKey!;const height=Math.ceil(entry.target.getBoundingClientRect().height);if(Math.abs((current[key]??0)-height)>1){if(next===current)next={...current};next[key]=height}}
      return next
    }))
    bodyRef.current?.querySelectorAll('.timed-event').forEach(node=>observer.observe(node))
    return()=>observer.disconnect()
  },[occurrences,view,cursor,hourHeight])

  const simultaneous=useMemo(()=>layoutTimeCards(occurrences.filter(item=>!item.event.allDay).map(item=>({top:item.start.getTime(),bottom:item.end.getTime()}))).reduce((max,item)=>Math.max(max,item.cols),1),[occurrences])
  const weekMinWidth=64+7*(simultaneous>1?simultaneous*88:80)
  const now = new Date()
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight

  return (
    <div className="time-view-scroll"><div className={`time-view is-${view}`} style={view==='week'?{minWidth:weekMinWidth}:undefined}>
      <div className={`time-header days-${days.length}`}>
        <div className="gutter" />
        {days.map((day) => (
          <div key={day.toISOString()} className={`time-day-head ${isToday(day) ? 'is-today' : ''}`}>
            <span className="dow">{day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
            <span className="num">{day.getDate()}</span>
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
                    className="event-chip"
                    style={{ background: color, color: contrastText(color) }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onEventClick(item.event, item.start)
                    }}
                  >
                    {item.event.recurrence.frequency !== 'none' && <RepeatIcon />}
                    <span className="event-title">{item.event.title || '(No title)'}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="time-scroll" ref={scrollRef}>
        <div ref={bodyRef} className={`time-body days-${days.length}`} style={{ height: 24 * hourHeight }}>
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
              const top=(clipped.start.getHours()*60+clipped.start.getMinutes())/60*hourHeight
              const endMinutes=clipped.end.getHours()*60+clipped.end.getMinutes()+clipped.end.getSeconds()/60
              const startMinutes=clipped.start.getHours()*60+clipped.start.getMinutes()
              const height=Math.max((endMinutes-startMinutes)/60*hourHeight,18)
              const key=day.toDateString()+'/'+item.event.id+'/'+item.start.toISOString()
              return {item,key,top,height,bottom:top+Math.max(height,cardHeights[key]??0)}
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
                      className="timed-event"
                      data-layout-key={key}
                      title={`${item.event.title} - ${formatTimeCompact(item.start)} - ${formatTimeCompact(item.end)}`}
                      style={{
                        top,
                        minHeight:height,
                        width,
                        left,
                        background: color,
                        color: contrastText(color),
                      }}
                      onClick={() => onEventClick(item.event, item.start)}
                    >
                      <span className="event-title">
                        {item.event.recurrence.frequency !== 'none' && <RepeatIcon />}
                        {item.event.title || '(No title)'}
                      </span>
                      <span className="event-time">{formatTimeCompact(item.start)} – {formatTimeCompact(item.end)}</span>
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
