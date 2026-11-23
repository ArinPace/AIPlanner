import {useState,type CSSProperties,type ReactNode,type Ref} from 'react'
import {formatHour,formatTimeCompact,isToday} from '../lib/dates'
import {timelineBounds} from '../lib/dayTimeline'
import {folderOccurrenceKey} from '../lib/eventFolders'
import {layoutTimeCards} from '../lib/timeLayout'
import type {ScheduleRow} from '../lib/freeTime'

export type TimelineCardOptions={folder:boolean;open:boolean;toggle?:()=>void;height:number}
type Props={
 day:Date;now:Date;zoom:number;rows:ScheduleRow[]
 childrenFor:(item:ScheduleRow)=>ScheduleRow[]
 hidden:(item:ScheduleRow)=>boolean
 renderCard:(item:ScheduleRow,options:TimelineCardOptions)=>ReactNode
 reminderStyle:(item:ScheduleRow)=>CSSProperties
 onSelect:(item:ScheduleRow)=>void
 onSlot:(minute:number)=>void
 nowRef?:Ref<HTMLDivElement>
}
export function DayTimeline({day,now,zoom,rows,childrenFor,hidden,renderCard,reminderStyle,onSelect,onSlot,nowRef}:Props){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set())
 const pixelsPerMinute=96*zoom/60
 const toggle=(key:string)=>setCollapsed(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})
 const line=(item:ScheduleRow,top?:number)=><button key={item.event.id+item.start.toISOString()} type="button" className={'day-clock-reminder'+(top===undefined?' is-all-day':'')} style={{...reminderStyle(item),...(top===undefined?{}:{top}),background:undefined,border:undefined}} onClick={()=>onSelect(item)} title={item.event.title}><span>{item.event.allDay?'Reminder':formatTimeCompact(item.start)} · {item.event.title||'(No title)'}</span></button>
 function cards(items:ScheduleRow[],origin=0):ReactNode{
  const shown=items.filter(item=>!item.event.allDay&&!hidden(item))
  const placed=layoutTimeCards(shown.filter(item=>!item.event.reminder).map(item=>{
   const bounds=timelineBounds(item,day)
   return {item,top:(bounds.start-origin)*pixelsPerMinute,bottom:(bounds.end-origin)*pixelsPerMinute,bounds}
  }))
  return <>{placed.map(({item,top,bottom,col,cols,bounds})=>{
   const folder=item.event.eventKind==='folder',key=folderOccurrenceKey(item),open=folder&&!collapsed.has(key),height=Math.max(1,bottom-top)
   return <div key={key} data-timeline-event={item.event.id} data-minute-start={bounds.start} data-minute-end={bounds.end} className={'day-clock-item'+(folder?' is-folder':'')+(open?' is-open':'')} style={{top,height,left:`calc(${col/cols*100}% + 3px)`,width:`calc(${100/cols}% - 6px)`}}>
    <div className="day-clock-card-slot">{renderCard(item,{folder,open,toggle:folder?()=>toggle(key):undefined,height})}</div>
    {open&&<div className="day-clock-folder-contents">{cards(childrenFor(item),bounds.start)}</div>}
   </div>
  })}{shown.filter(item=>item.event.reminder).map(item=>line(item,(timelineBounds(item,day).start-origin)*pixelsPerMinute))}</>
 }
 const nowMinute=now.getHours()*60+now.getMinutes()+now.getSeconds()/60
 return <div className="day-clock-layout">
  {rows.filter(item=>item.event.allDay&&!hidden(item)).map(item=>item.event.reminder?line(item):<div key={item.event.id} className="day-clock-all-day">{renderCard(item,{folder:false,open:false,height:40})}</div>)}
  <div className="day-clock" style={{height:1440*pixelsPerMinute,'--clock-hour-height':96*zoom} as CSSProperties}>
   {Array.from({length:24},(_,hour)=><div key={hour} className="day-clock-hour" style={{top:hour*60*pixelsPerMinute}}><span className="day-clock-hour-label">{formatHour(hour)}</span><button type="button" className="day-clock-slot" style={{height:60*pixelsPerMinute}} aria-label={'Add event at '+formatHour(hour)} onClick={()=>onSlot(hour*60)}/></div>)}
   <div className="day-clock-events">{cards(rows)}</div>
   {isToday(day)&&<div ref={nowRef} className="day-clock-now" style={{top:nowMinute*pixelsPerMinute}} role="img" aria-label={'Current time '+formatTimeCompact(now)}><span>{formatTimeCompact(now)}</span></div>}
  </div>
 </div>
}
