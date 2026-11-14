import {FREE_TIME_TAG_ID,freeTimeGaps} from '../lib/freeTime'
import {addDays} from '../lib/dates'
import { PlannerDate as Date } from '../lib/timezone.js'
import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent, Tag } from '../types'
import { expandEvents } from '../lib/recurrence'

export function TagChart({events,tags,cursor,onClose}:{events:CalendarEvent[];tags:Tag[];cursor:Date;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null)
 const [month,setMonth]=useState(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`)
 const [metric,setMetric]=useState<'count'|'hours'>('count')
 useEffect(()=>{dialog.current?.showModal()},[])
 const [year,m]=month.split('-').map(Number)
 const start=new Date(year,m-1,1),end=new Date(year,m,1)
 const busy=Number.isFinite(start.getTime())?expandEvents(events,start,new Date(end.getTime()-1)).filter(({event})=>event.eventKind!=='folder'):[]
 const rows=[...tags,{id:FREE_TIME_TAG_ID,name:'Free time',color:'#b8c5d6'},{id:'untagged',name:'Untagged',color:'#8a919c'}].map(tag=>({...tag,count:0,hours:0}))
 for(const occurrence of busy){
  const event=occurrence.event
  const assigned=event.title.trim().toLowerCase()==='free time'?[rows.find(tag=>tag.id===FREE_TIME_TAG_ID)!]:rows.filter(tag=>event.tagIds.includes(tag.id))
  const buckets=assigned.length?assigned:[rows[rows.length-1]]
  const hours=Math.max(0,Math.min(end.getTime(),occurrence.end.getTime())-Math.max(start.getTime(),occurrence.start.getTime()))/3600000
  if(!hours)continue
  for(const row of buckets){row.count++;row.hours+=event.reminder?0:hours}
 }
 const free=rows.find(row=>row.id===FREE_TIME_TAG_ID)!
 for(let day=start;Number.isFinite(day.getTime())&&day<end;day=addDays(day,1)){for(const gap of freeTimeGaps(busy,day,addDays(day,1))){free.count++;free.hours+=(gap.end.getTime()-gap.start.getTime())/3600000}}
 const total=rows.reduce((sum,row)=>sum+row[metric],0)
 let offset=0
 const slices=rows.filter(row=>row[metric]>0).map(row=>{const from=offset;offset+=row[metric]/total*100;return `${row.color} ${from}% ${offset}%`})
 return <dialog ref={dialog} aria-label="Tag statistics" className="tag-chart-dialog" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
  <header><h2>Events by tag</h2><button autoFocus type="button" className="icon-btn" aria-label="Close tag statistics" onClick={onClose}>×</button></header>
  <div className="tag-chart-controls"><label>Month <input aria-label="Statistics month" type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}} /></label><label>Measure <select aria-label="Chart measure" value={metric} onChange={e=>setMetric(e.target.value as 'count'|'hours')}><option value="count">Number of events</option><option value="hours">Time (hours)</option></select></label></div>
  {total>0?<div className="tag-pie" role="img" aria-label={`Events by tag: ${rows.filter(row=>row[metric]>0).map(row=>`${row.name}: ${row[metric].toLocaleString(undefined,{maximumFractionDigits:1})} ${metric==='hours'?'hours':'events'}`).join(', ')}`} style={{background:`conic-gradient(${slices.join(',')})`}} />:<p>No events in this month.</p>}
  <table className="tag-chart-table"><thead><tr><th>Tag</th><th>Events</th><th>Hours</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><span className="tag-swatch" style={{background:row.color}} />{row.name}</td><td>{row.count}</td><td>{row.hours.toLocaleString(undefined,{maximumFractionDigits:1})}</td></tr>)}</tbody></table>

 </dialog>
}
