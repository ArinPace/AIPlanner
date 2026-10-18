import { PlannerDate as Date } from '../lib/timezone.js'
import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent, Tag } from '../types'
import { expandEvent } from '../lib/recurrence'

export function TagChart({events,tags,cursor,onClose}:{events:CalendarEvent[];tags:Tag[];cursor:Date;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null)
 const [month,setMonth]=useState(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`)
 const [metric,setMetric]=useState<'count'|'hours'>('count')
 useEffect(()=>{dialog.current?.showModal()},[])
 const [year,m]=month.split('-').map(Number)
 const start=new Date(year,m-1,1),end=new Date(year,m,1)
 const rows=[...tags,{id:'untagged',name:'Untagged',color:'#8a919c'}].map(tag=>({...tag,count:0,hours:0}))
 if(Number.isFinite(start.getTime()))for(const event of events){
  const duration=Math.max(0,new Date(event.end).getTime()-new Date(event.start).getTime())
  const occurrences=expandEvent(event,new Date(start.getTime()-duration),new Date(end.getTime()-1))
  const assigned=rows.filter(tag=>event.tagIds.includes(tag.id))
  const buckets=assigned.length?assigned:[rows[rows.length-1]]
  for(const occurrence of occurrences){
   const hours=Math.max(0,Math.min(end.getTime(),occurrence.end.getTime())-Math.max(start.getTime(),occurrence.start.getTime()))/3600000
   if(!hours)continue
   for(const row of buckets){row.count++;row.hours+=event.reminder?0:hours}
  }
 }
 const total=rows.reduce((sum,row)=>sum+row[metric],0)
 let offset=0
 const slices=rows.filter(row=>row[metric]>0).map(row=>{const from=offset;offset+=row[metric]/total*100;return `${row.color} ${from}% ${offset}%`})
 return <dialog ref={dialog} aria-label="Tag statistics" className="tag-chart-dialog" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
  <header><h2>Events by tag</h2><button autoFocus type="button" className="icon-btn" aria-label="Close tag statistics" onClick={onClose}>×</button></header>
  <div className="tag-chart-controls"><label>Month <input aria-label="Statistics month" type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}} /></label><label>Measure <select aria-label="Chart measure" value={metric} onChange={e=>setMetric(e.target.value as 'count'|'hours')}><option value="count">Number of events</option><option value="hours">Time (hours)</option></select></label></div>
  {total>0?<div className="tag-pie" role="img" aria-label={`Events by tag: ${rows.filter(row=>row[metric]>0).map(row=>`${row.name}: ${row[metric].toLocaleString(undefined,{maximumFractionDigits:1})} ${metric==='hours'?'hours':'events'}`).join(', ')}`} style={{background:`conic-gradient(${slices.join(',')})`}} />:<p>No events in this month.</p>}
  <table className="tag-chart-table"><thead><tr><th>Tag</th><th>Events</th><th>Hours</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><span className="tag-swatch" style={{background:row.color}} />{row.name}</td><td>{row.count}</td><td>{row.hours.toLocaleString(undefined,{maximumFractionDigits:1})}</td></tr>)}</tbody></table>
  <p className="tag-chart-help">Includes hidden tags and recurring occurrences. Events with multiple tags count toward each tag. Time is clipped to this month; reminders have no duration; all-day events count as 24 hours per full day. Overlapping events are counted separately.</p>
 </dialog>
}
