import {planningRequest} from '../lib/api'
import {intensityFor, type PlanningProfile} from '../lib/planning'
import {occurrenceChecked,repeatsWithAncestors} from '../lib/eventChecklist'
import {CalendarDoneButton} from './CalendarDoneButton'
import {durationHeight} from '../lib/calendarDisplay'
import {TaskScreenTimeButton} from './TaskScreenTimeButton'
import {taskScreenTimeWindow} from '../lib/taskScreenTime'
import {supportsScreenTime} from '../lib/platform'
import { freeTimeAppearance, withFreeTime, type ScheduleRow } from '../lib/freeTime'
import { eventAppearance } from '../lib/eventAppearance'
import { PlannerDate as Date } from '../lib/timezone.js'
import { urgencyColor } from '../lib/urgencyColor'
import { Fragment,useEffect,useLayoutEffect, useRef,useState,type ReactNode } from 'react'
import {occurrenceFolderGroups,folderExpanded,folderOccurrenceKey} from '../lib/eventFolders'
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
  scaleToDuration?:boolean
  active?:boolean
  cursor: Date
  view: Extract<CalendarView, 'week' | 'day'>
  zoom: number
  busyOccurrences: Occurrence[]
  occurrences: Occurrence[]
  tags: Tag[]
  onSlotClick: (date: Date, allDay?: boolean) => void
  onEventDone: (event:CalendarEvent,start:Date)=>Promise<string>
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

export function TimeGridView({ scaleToDuration=false, active=true,cursor, view, zoom, occurrences, busyOccurrences, tags, onSlotClick, onEventClick, onEventDone }: TimeGridViewProps) {
  const [planning, setPlanning] = useState<PlanningProfile>()
  useEffect(() => {
    if (!active) return
    let live = true
    function refresh() {
      void planningRequest<{profile: PlanningProfile}>().then(({profile}) => {
        if (live) setPlanning(profile)
      }).catch(() => {})
    }
    refresh()
    window.addEventListener('planner-intensity-refresh', refresh)
    return () => { live = false; window.removeEventListener('planner-intensity-refresh', refresh) }
  }, [active])
  const dayIntensity = (day: Date) => planning && intensityFor(planning, toDateInput(day), day.getDay())
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
  const now=new Date(),grouped=occurrenceFolderGroups(occurrences),busyGrouped=occurrenceFolderGroups(busyOccurrences)
  const folderOpen=(item:Occurrence)=>folderExpanded(item,now.getTime(),openedFolders)
  function folderChildren(item:Occurrence,day?:Date):ScheduleRow[]{
    const start=day&&startOfDay(day)>item.start?startOfDay(day):item.start
    const end=day&&addDays(startOfDay(day),1)<item.end?addDays(startOfDay(day),1):item.end
    const children=grouped.children.get(folderOccurrenceKey(item))||[]
    return withFreeTime(day?children.filter(child=>clipToDay(child,day)):children,busyGrouped.children.get(folderOccurrenceKey(item))||[],start,end)
  }
  function folderRows(item:Occurrence):number{return 1+(folderOpen(item)?folderChildren(item).reduce((count,child)=>count+(child.event.eventKind==='folder'?folderRows(child):1),0):0)}
  const toggleFolder=(item:Occurrence)=>setOpenedFolders(current=>{const next=new Set(current);if(next.has(folderOccurrenceKey(item)))next.delete(folderOccurrenceKey(item));else next.add(folderOccurrenceKey(item));return next})
  // Give short activities a readable row without expanding cards past their time bounds.
  const visibleDurations=grouped.top.filter(item=>item.event.eventKind!=='folder'&&!item.event.allDay&&!item.event.reminder&&days.some(day=>clipToDay(item,day))).map(item=>(item.end.getTime()-item.start.getTime())/60000).filter(minutes=>minutes>=1)
  const shortest=Math.min(30,...visibleDurations)
  const folderHeight=Math.max(0,...grouped.top.filter(item=>item.event.eventKind==='folder').map(item=>folderRows(item)*36*3600000/Math.max(60000,item.end.getTime()-item.start.getTime())))
  const hourHeight = Math.max(Math.round(BASE_HOUR_HEIGHT * zoom),Math.ceil(22*60/shortest),Math.ceil(folderHeight))

  const dayKey=toDateInput(cursor)
  const todayKey=toDateInput(now),mobileWeek=view==='week'
  const containsToday=days.some(day=>toDateInput(day)===todayKey)
  useLayoutEffect(() => {
    if(!active){previousLayout.current=null;return}
    const node = mobileWeek?weekScrollRef.current:scrollRef.current
    if (!node) return
    const key=view+'/'+dayKey+'/'+todayKey+'/'+(mobileWeek?'mobile':'grid')+'/'+(mobileWeek&&scaleToDuration),previous=previousLayout.current
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
  }, [active,view,dayKey,todayKey,mobileWeek,hourHeight,containsToday,scaleToDuration])

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight
  const busyEvents = busyOccurrences.map(item => item.event)
  function completionLeaves(item: Occurrence, insideFolder = false): Occurrence[] {
    if (item.event.eventKind === 'folder') {
      const children = busyGrouped.children.get(folderOccurrenceKey(item)) || []
      const leaves = children.flatMap(child => completionLeaves(child, true))
      return insideFolder || leaves.some(leaf => leaf.event.checklistLinks?.length) ? leaves : []
    }
    return !repeatsWithAncestors(item.event, busyEvents) && (insideFolder || item.event.checklistLinks?.length) ? [item] : []
  }
  function completed(item: Occurrence): boolean {
    if (occurrenceChecked(item.event, item.start)) return true
    if (item.event.eventKind !== 'folder') return false
    const leaves = completionLeaves(item)
    return leaves.length > 0 && leaves.every(leaf => occurrenceChecked(leaf.event, leaf.start))
  }
  const appearance = (item: Occurrence) => completed(item) || ('freeTime' in item && item.freeTime)
    ? freeTimeAppearance : eventAppearance(eventColor(item.event,tags),item.event.reminder)
  const completionClass = (item: Occurrence) => completed(item) ? ' is-completed-free-time' : ''
  const doneButton=(item:Occurrence)=><CalendarDoneButton item={item} leaves={completionLeaves(item)} onDone={onEventDone}/>
  function dayFolderBody(item:Occurrence,day:Date):ReactNode{
    const open=folderOpen(item),children=(grouped.children.get(folderOccurrenceKey(item))||[]).filter(child=>clipToDay(child,day))
    return <><div className="folder-event-header"><button type="button" className={"folder-grid-toggle"+completionClass(item)} aria-expanded={open} onClick={()=>toggleFolder(item)} style={appearance(item)}>{open?'▾':'▸'} ▣ {item.event.title}<small>{formatTimeCompact(item.start)}–{formatTimeCompact(item.end)} · {children.length} {children.length===1?'item':'items'}</small></button>{doneButton(item)}<button type="button" className="folder-edit-button" aria-label={'Edit folder '+item.event.title} onClick={()=>onEventClick(item.event,item.start)}>Edit</button></div>{open&&<div className="folder-day-children">{folderChildren(item,day).map(child=>child.event.eventKind==='folder'?<div className="nested-day-folder" key={child.event.id}>{dayFolderBody(child,day)}</div>:<div key={child.event.id} className="calendar-task-with-actions"><button type="button" className={"event-chip folder-child-event"+completionClass(child)} onClick={()=>child.freeTime?onSlotClick(child.start):onEventClick(child.event,child.start)} style={appearance(child)}><span>{formatTimeCompact(child.start)}–{formatTimeCompact(child.end)}</span><strong className="event-title">{child.event.title}</strong></button>{!child.freeTime&&doneButton(child)}</div>)}</div>}</>
  }
  function agendaRows(items:ScheduleRow[],day:Date,showNow:boolean,nested=false):ReactNode{
    const currentFolder=items.find(item=>item.event.eventKind==='folder'&&item.start<=now&&now<item.end)
    const next=items.findIndex(item=>!item.event.allDay&&item.end>now)
    const marker=<div ref={mobileNowRef} className="mobile-week-now" role="img" aria-label={'Current time '+formatTimeCompact(now)}><span>Now · {formatTimeCompact(now)}</span></div>
    return <>{items.map((item,index)=>{
      const folder=item.event.eventKind==='folder',children=(grouped.children.get(folderOccurrenceKey(item))||[]).filter(child=>clipToDay(child,day)),open=folder&&folderOpen(item)
      const chip=<button type="button" className={'event-chip mobile-week-event'+(nested?' folder-child-event':'')+completionClass(item)} style={{...appearance(item),...(scaleToDuration&&view==='week'&&(!folder||!open)?{height:durationHeight(item,'week',zoom,startOfDay(day).getTime(),addDays(startOfDay(day),1).getTime())}:{})}} title={item.event.title} aria-expanded={folder?open:undefined} onClick={()=>item.freeTime?onSlotClick(item.start):folder?toggleFolder(item):onEventClick(item.event,item.start)}>
        <span className="mobile-week-time">{item.event.allDay?(item.event.reminder?'Reminder':'All day'):item.event.reminder?formatTimeCompact(item.start):formatTimeCompact(item.start)+'–'+formatTimeCompact(item.end)}</span>
        <span className="event-title">{folder&&(open?'▾ ▣ ':'▸ ▣ ')}{item.event.urgency!=null&&<span className="event-urgency-badge" style={urgencyColor(item.event.urgency)}>{item.event.urgency}</span>}{item.event.title||'(No title)'}</span>
        {folder&&<small className="folder-event-count">{children.length} {children.length===1?'item':'items'}</small>}
      </button>
      return <Fragment key={item.event.id+item.start.toISOString()}>{showNow&&!currentFolder&&index===next&&marker}{folder?<div className="agenda-event-folder"><div className="folder-event-header">{chip}{doneButton(item)}<button type="button" className="folder-edit-button" aria-label={'Edit folder '+item.event.title} onClick={()=>onEventClick(item.event,item.start)}>Edit</button></div>{open&&<div className="folder-agenda-children">{children.length?agendaRows(folderChildren(item,day),day,showNow&&currentFolder===item,true):<><p className="quiet">No visible events in this folder.</p>{showNow&&currentFolder===item&&marker}</>}</div>}</div>:!item.freeTime&&!item.event.reminder&&!item.event.allDay?<div className="calendar-task-with-actions">{chip}{doneButton(item)}{supportsScreenTime()&&<TaskScreenTimeButton task={taskScreenTimeWindow(item.event,item.start,item.end)}/>}</div>:chip}</Fragment>
    })}{showNow&&!currentFolder&&next===-1&&marker}</>
  }

  return (
    <div ref={weekScrollRef} data-layout={mobileWeek?'agenda':'grid'} className={`time-view-scroll ${view === 'week' ? 'has-mobile-week' : ''}`}>
      {view === 'week' && <div className={'mobile-week'+(scaleToDuration?' is-duration-scaled':'')}>
        {days.map(day => {
          const items = withFreeTime(grouped.top.filter(item => clipToDay(item, day)), busyGrouped.top, startOfDay(day), addDays(startOfDay(day),1))
          return <section className="mobile-week-day" key={day.toISOString()}>
            <div className="mobile-week-heading">
              <h3 className={isToday(day) ? 'is-today' : ''}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <PlanningButton date={toDateInput(day)} intensity={dayIntensity(day)}/>
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
            {view==='week'?<PlanningButton date={toDateInput(day)} dayNumber={day.getDate()}/>:<><span className="num">{day.getDate()}</span><PlanningButton date={toDateInput(day)} intensity={dayIntensity(day)}/></>}
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
            const timed = withFreeTime(grouped.top.filter((item) => !item.event.allDay && clipToDay(item, day)), busyGrouped.top, startOfDay(day), addDays(startOfDay(day),1))
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
                  const color = completed(item) ? '#000' : eventColor(item.event, tags)

                  if(item.event.eventKind==='folder'){
                    return <div key={key} className={'timed-event-folder'+(folderOpen(item)?' is-expanded':' is-collapsed')} style={{top,height,width,left,borderColor:color,backgroundColor:completed(item)?'#fff':color}}>{dayFolderBody(item,day)}</div>
                  }

                  return (
                    <div key={`${item.event.id}-${item.start.toISOString()}`} className="timed-event-with-actions" style={{top,height,width,left}}><button
                      type="button"
                      className={`timed-event ${item.event.reminder?'reminder-event':''} ${height<32?'is-short':''} ${height<14?'is-tiny':''}`+completionClass(item)}
                      data-layout-key={key}
                      title={`${item.event.reminder?'Reminder: ':''}${item.event.title} - ${formatTimeCompact(item.start)}${item.event.reminder?'':' - '+formatTimeCompact(item.end)}`}
                      style={{
                        top:0,
                        height,
                        minHeight:0,
                        maxHeight:height,
                        width:'100%',
                        left:0,
                        ...appearance(item),
                      }}
                      onClick={() => item.freeTime?onSlotClick(item.start):onEventClick(item.event, item.start)}
                    >
                      <span className="event-title">
                        {item.event.urgency!=null && <span className="event-urgency-badge" style={urgencyColor(item.event.urgency)} aria-label={'Urgency '+item.event.urgency}>{item.event.urgency}</span>}
                        {item.event.title || '(No title)'}
                      </span>
                      <span className="event-time">{item.event.reminder?'Reminder \u00b7 '+formatTimeCompact(item.start):formatTimeCompact(item.start)+' \u2013 '+formatTimeCompact(item.end)}</span>
                    </button>{!item.freeTime&&!item.event.reminder&&doneButton(item)}</div>
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
