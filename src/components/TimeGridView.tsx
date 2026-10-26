import { eventAppearance } from '../lib/eventAppearance'
import { PlannerDate as Date } from '../lib/timezone.js'
import { urgencyColor } from '../lib/urgencyColor'
import { Fragment,useEffect,useLayoutEffect, useRef,useState,type ReactNode } from 'react'
import {occurrenceFolderGroups,folderExpanded} from '../lib/eventFolders'
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
  active?:boolean
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

export function TimeGridView({ active=true,cursor, view, zoom, occurrences, tags, onSlotClick, onEventClick }: TimeGridViewProps) {
  const days = view === 'day' ? [startOfDay(cursor)] : getWeekDays(cursor)
  const scrollRef = useRef<HTMLDivElement>(null)
  const weekScrollRef=useRef<HTMLDivElement>(null)
  const mobileNowRef=useRef<HTMLDivElement>(null)
  const [,setClockTick]=useState(0)
  useEffect(()=>{
    if(!active)return
    const timer=window.setInterval(()=>setClockTick(tick=>tick+1),30000)
    return()=>window.clearInterval(timer)
  },[active])
  const previousLayout = useRef<{key:string;hourHeight:number}|null>(null)
  const bodyRef=useRef<HTMLDivElement>(null)
  const [openedFolders,setOpenedFolders]=useState<Set<string>>(()=>new Set())
  const now=new Date(),grouped=occurrenceFolderGroups(occurrences)
  const folderOpen=(item:Occurrence)=>folderExpanded(item,now.getTime(),openedFolders)
  const toggleFolder=(item:Occurrence)=>setOpenedFolders(current=>{const next=new Set(current);if(next.has(item.event.id))next.delete(item.event.id);else next.add(item.event.id);return next})
  // Give short activities a readable row without expanding cards past their time bounds.
  const visibleDurations=grouped.top.filter(item=>item.event.eventKind!=='folder'&&!item.event.allDay&&!item.event.reminder&&days.some(day=>clipToDay(item,day))).map(item=>(item.end.getTime()-item.start.getTime())/60000).filter(minutes=>minutes>=1)
  const shortest=Math.min(30,...visibleDurations)
  const folderHeight=Math.max(0,...grouped.top.filter(item=>item.event.eventKind==='folder').map(item=>(36+(folderOpen(item)?(grouped.children.get(item.event.id)?.length||0)*36:0))*3600000/Math.max(60000,item.end.getTime()-item.start.getTime())))
  const hourHeight = Math.max(Math.round(BASE_HOUR_HEIGHT * zoom),Math.ceil(22*60/shortest),Math.ceil(folderHeight))

  const dayKey=toDateInput(cursor)
  const todayKey=toDateInput(now),mobileWeek=view==='week'
  const containsToday=days.some(day=>toDateInput(day)===todayKey)
  useLayoutEffect(() => {
    if(!active){previousLayout.current=null;return}
    const node = mobileWeek?weekScrollRef.current:scrollRef.current
    if (!node) return
    const key=view+'/'+dayKey+'/'+todayKey+'/'+(mobileWeek?'mobile':'grid'),previous=previousLayout.current
    if(previous?.key!==key){
      if(mobileWeek){
        const marker=mobileNowRef.current
        node.scrollTop=marker?Math.max(0,node.scrollTop+marker.getBoundingClientRect().top-node.getBoundingClientRect().top-node.clientHeight*.25):0
      }else{
        const current=new Date(),showNow=containsToday
        const target=showNow?(current.getHours()+current.getMinutes()/60)*hourHeight:8*hourHeight
        node.scrollTop=Math.max(0,target-(showNow?node.clientHeight*.25:16))
      }
    }else if(!mobileWeek&&previous.hourHeight!==hourHeight){
      const midpoint=node.scrollTop+node.clientHeight/2
      node.scrollTop=midpoint/previous.hourHeight*hourHeight-node.clientHeight/2
    }
    previousLayout.current={key,hourHeight}
  }, [active,view,dayKey,todayKey,mobileWeek,hourHeight,containsToday])

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight
  function agendaRows(items:Occurrence[],day:Date,showNow:boolean,nested=false):ReactNode{
    const currentFolder=items.find(item=>item.event.eventKind==='folder'&&item.start<=now&&now<item.end)
    const next=items.findIndex(item=>!item.event.allDay&&item.end>now)
    const marker=<div ref={mobileNowRef} className="mobile-week-now" role="img" aria-label={'Current time '+formatTimeCompact(now)}><span>Now · {formatTimeCompact(now)}</span></div>
    return <>{items.map((item,index)=>{
      const folder=item.event.eventKind==='folder',children=(grouped.children.get(item.event.id)||[]).filter(child=>clipToDay(child,day)),open=folder&&folderOpen(item)
      const chip=<button type="button" className={'event-chip mobile-week-event'+(nested?' folder-child-event':'')} style={eventAppearance(eventColor(item.event,tags),item.event.reminder)} title={item.event.title} aria-expanded={folder?open:undefined} onClick={()=>folder?toggleFolder(item):onEventClick(item.event,item.start)}>
        <span className="mobile-week-time">{item.event.allDay?(item.event.reminder?'Reminder':'All day'):formatTimeCompact(clipToDay(item,day)!.start)}</span>
        <span className="event-title">{folder&&(open?'▾ ▣ ':'▸ ▣ ')}{item.event.urgency!=null&&<span className="event-urgency-badge" style={urgencyColor(item.event.urgency)}>{item.event.urgency}</span>}{item.event.title||'(No title)'}</span>
        {folder&&<small className="folder-event-count">{children.length} events · {formatTimeCompact(item.end)}</small>}
      </button>
      return <Fragment key={item.event.id+item.start.toISOString()}>{showNow&&!currentFolder&&index===next&&marker}{folder?<div className="agenda-event-folder"><div className="folder-event-header">{chip}<button type="button" className="folder-edit-button" aria-label={'Edit folder '+item.event.title} onClick={()=>onEventClick(item.event,item.start)}>Edit</button></div>{open&&<div className="folder-agenda-children">{children.length?agendaRows(children,day,showNow&&currentFolder===item,true):<><p className="quiet">No visible events in this folder.</p>{showNow&&currentFolder===item&&marker}</>}</div>}</div>:chip}</Fragment>
    })}{showNow&&!currentFolder&&next===-1&&marker}</>
  }

  return (
    <div ref={weekScrollRef} data-layout={mobileWeek?'agenda':'grid'} className={`time-view-scroll ${view === 'week' ? 'has-mobile-week' : ''}`}>
      {view === 'week' && <div className="mobile-week">
        {days.map(day => {
          const items = grouped.top.filter(item => clipToDay(item, day)).sort((a, b) =>
            Number(b.event.allDay) - Number(a.event.allDay) || a.start.getTime() - b.start.getTime())
          return <section className="mobile-week-day" key={day.toISOString()}>
            <div className="mobile-week-heading">
              <h3 className={isToday(day) ? 'is-today' : ''}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <PlanningButton date={toDateInput(day)}/>
              <button type="button" className="text-btn" aria-label={'Add event on ' + day.toDateString()} onClick={() => onSlotClick(startOfDay(day), true)}>+</button>
            </div>
            {items.length === 0 && <p className="mobile-week-empty">No events</p>}
            {agendaRows(items,day,isToday(day))}
          </section>
        })}
      </div>}
      <div className={`time-view is-${view}`}>
      <div className={`time-header days-${days.length}`}>
        <div className="gutter" />
        {days.map((day) => (
          <div key={day.toISOString()} className={`time-day-head ${isToday(day) ? 'is-today' : ''}`}>
            <span className="dow">{day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
            {view==='week'?<PlanningButton date={toDateInput(day)} dayNumber={day.getDate()}/>:<><span className="num">{day.getDate()}</span><PlanningButton date={toDateInput(day)}/></>}
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
            const timed = grouped.top.filter((item) => !item.event.allDay && clipToDay(item, day))
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

                  if(item.event.eventKind==='folder'){
                    const open=folderOpen(item),children=(grouped.children.get(item.event.id)||[]).filter(child=>clipToDay(child,day))
                    return <div key={key} className="timed-event-folder" style={{top,height,width,left,borderColor:color}}><div className="folder-event-header"><button type="button" className="folder-grid-toggle" aria-expanded={open} onClick={()=>toggleFolder(item)} style={eventAppearance(color)}>{open?'▾':'▸'} ▣ {item.event.title}<small>{formatTimeCompact(item.start)}–{formatTimeCompact(item.end)} · {children.length} events</small></button><button type="button" className="folder-edit-button" aria-label={'Edit folder '+item.event.title} onClick={()=>onEventClick(item.event,item.start)}>Edit</button></div>{open&&<div className="folder-day-children">{children.map(child=><button type="button" key={child.event.id} className="event-chip folder-child-event" onClick={()=>onEventClick(child.event,child.start)} style={eventAppearance(eventColor(child.event,tags),child.event.reminder)}><span>{formatTimeCompact(child.start)}–{formatTimeCompact(child.end)}</span><strong>{child.event.title}</strong></button>)}</div>}</div>
                  }

                  return (
                    <button
                      key={`${item.event.id}-${item.start.toISOString()}`}
                      type="button"
                      className={`timed-event ${item.event.reminder?'reminder-event':''} ${height<32?'is-short':''} ${height<14?'is-tiny':''}`} 
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
