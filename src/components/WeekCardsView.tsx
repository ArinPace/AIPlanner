import {useRef,useState} from 'react'
import type {CalendarEvent,Occurrence,Tag} from '../types'
import {addDays,startOfDay,isToday,formatTimeCompact,toDateInput} from '../lib/dates'
import {occurrenceFolderGroups,folderOccurrenceKey} from '../lib/eventFolders'
import {eventAppearance} from '../lib/eventAppearance'
import {eventColor} from '../lib/colors'
import {occurrenceChecked} from '../lib/eventChecklist'
import {freeTimeAppearance} from '../lib/freeTime'
import {useWeekSwipe} from '../lib/useWeekSwipe'
function duration(minutes:number){const rounded=Math.round(minutes),h=Math.floor(rounded/60),m=rounded%60;return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`}
export function WeekCardsView({visibleEventIds,cursor,occurrences,tags,zoom,onEventClick,onDayOpen,onNavigate,active}:{visibleEventIds?:ReadonlySet<string>;cursor:Date;occurrences:Occurrence[];tags:Tag[];zoom:number;onEventClick:(event:CalendarEvent,start:Date)=>void;onDayOpen:(date:Date)=>void;onNavigate:(direction:-1|1)=>void;active:boolean}){
 const ref=useRef<HTMLDivElement>(null)
 const [opened,setOpened]=useState<Set<string>>(()=>new Set())
 useWeekSwipe(ref,active,onNavigate)
 return <div ref={ref} className="week-card-view" aria-label="Week calendar" style={{fontSize:14*zoom}}>{Array.from({length:7},(_,i)=>addDays(startOfDay(cursor),i)).map(day=>{
  const next=addDays(day,1)
  const items=occurrences.filter(item=>item.start<next&&item.end>day).sort((a,b)=>Number(Boolean(b.event.allDay))-Number(Boolean(a.event.allDay))||a.start.getTime()-b.start.getTime()||a.event.title.localeCompare(b.event.title))
  const groups=occurrenceFolderGroups(items.filter(item=>item.event.eventKind!=='folder'||visibleEventIds===undefined||visibleEventIds.has(item.event.id)))
  const cards:{item:Occurrence;depth:number}[]=[]
  function append(item:Occurrence,depth=0){cards.push({item,depth});if(item.event.eventKind==='folder'&&opened.has(folderOccurrenceKey(item)))for(const child of groups.children.get(folderOccurrenceKey(item))||[])append(child,depth+1)}
  groups.top.forEach(item=>append(item))
  return <section className={'week-card-day'+(isToday(day)?' is-today':'')} key={toDateInput(day)} data-week-day={toDateInput(day)}><button type="button" className="week-card-date" aria-label={'Open '+day.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} onClick={()=>onDayOpen(day)}><span>{day.toLocaleDateString('en-US',{weekday:'short'})}</span><strong>{day.getDate()}</strong></button><div className="week-event-strip" data-ignore-week-swipe tabIndex={0} aria-label={'Events on '+day.toLocaleDateString('en-US',{month:'long',day:'numeric'})}>{cards.length?cards.map(({item,depth})=>{
   const folder=item.event.eventKind==='folder',key=folderOccurrenceKey(item),expanded=folder&&opened.has(key),children=groups.children.get(key)||[]
   const filtered=visibleEventIds!==undefined&&!visibleEventIds.has(item.event.id)
   const done=!folder&&occurrenceChecked(item.event,item.start),from=item.start<day?day:item.start,to=item.end>next?next:item.end
   return <button type="button" key={item.event.id+'/'+item.start.toISOString()} className={'week-event-card'+(done?' is-completed':'')+(item.event.reminder?' is-reminder':'')+(filtered?' is-filtered':'')+(folder?' is-folder':'')+(depth?' is-nested':'')} aria-expanded={folder?expanded:undefined} aria-label={folder?(expanded?'Collapse folder ':'Expand folder ')+item.event.title:undefined} inert={filtered} aria-hidden={filtered?true:undefined} style={done?freeTimeAppearance:eventAppearance(eventColor(item.event,tags),item.event.reminder)} title={item.event.title} onClick={()=>{if(folder)setOpened(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next});else onEventClick(item.event,item.start)}}><strong className="week-card-title">{folder&&<span className="week-folder-indicator" aria-hidden="true">{expanded?'▾':'▸'} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h7l2 3h9v12H3V6Z"/></svg> </span>}{done&&<span>Free time · </span>}<span className={done?'completed-original-title':undefined}>{item.event.title||'(No title)'}</span></strong><span className="week-card-meta">{folder&&<span>{children.length} {children.length===1?'item':'items'}</span>}<span>{item.event.allDay?'All day':formatTimeCompact(from)}</span>{!item.event.allDay&&<span>{item.event.reminder?'Reminder':duration(Math.max(1,(to.getTime()-from.getTime())/60000))}</span>}</span></button>
  }):<span className="week-no-events">No events</span>}</div></section>
 })}</div>
}
