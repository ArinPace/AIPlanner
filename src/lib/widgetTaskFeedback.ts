import type {CalendarEvent,Tag} from '../types.js'
import {detachEventOccurrence, saveEventGroup} from './eventFolders.js'
import {expandEvents} from './recurrence.js'
import {PlannerDate} from './timezone.js'
import {eventType} from './eventType.js'

export type TaskFeedback={id:string;task:{id:string;title:string;start:number;end:number;planningTaskId?:string};remainingMinutes:number;done:boolean;reportedAt:number;requestedEnd?:number}
export type TaskTimeResult={applied:boolean;eventId?:string;end?:string;note:string}
export function resizeWidgetOccurrence(events:CalendarEvent[], feedback:TaskFeedback,tags:Tag[]=[]):{events:CalendarEvent[];result:TaskTimeResult} {
 const {task,reportedAt,remainingMinutes,done}=feedback
 if(!Number.isFinite(reportedAt)||!Number.isSafeInteger(remainingMinutes)||remainingMinutes<0)throw new Error('Invalid remaining time.')
 const startMs=Math.round(task.start*1000),endMs=Math.round(task.end*1000)
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)throw new Error('Invalid activity time.')
 const separator=task.id.lastIndexOf('@'),id=separator<0?task.id:task.id.slice(0,separator)
 if(feedback.requestedEnd!==undefined&&(!Number.isFinite(feedback.requestedEnd)||Math.abs(feedback.requestedEnd-(reportedAt+(done?0:remainingMinutes*60)))>61))throw new Error('Invalid requested end time.')
 const start=new Date(startMs).toISOString(),target=new Date(Math.max(startMs+1000,(done?reportedAt:feedback.requestedEnd??reportedAt+remainingMinutes*60)*1000)).toISOString()
 const deferred=(note:string)=>({events,result:{applied:false,note}})
 // A retry after a successful, but unacknowledged, recurring edit reuses its standalone occurrence.
 const source=events.find(e=>e.detachedFrom===id&&Date.parse(e.start)===startMs)||events.find(e=>e.id===id)
 if(!source||source.allDay||source.reminder||source.eventKind==='folder')return deferred('The original occurrence is no longer available. Reconcile this feedback against current calendar/history without guessing or changing the series.')
 const occurrence=expandEvents(events,new PlannerDate(startMs-1),new PlannerDate(Math.max(endMs,Date.parse(target))+1)).find(o=>o.event.id===source.id&&o.start.getTime()===startMs)
 if(!occurrence)return deferred('The occurrence has changed or was removed. Review current state/history before applying the feedback.')
 if(occurrence.end.getTime()===Date.parse(target))return {events,result:{applied:true,eventId:source.id,end:target,note:'This occurrence already has the requested end time.'}}
 if(Math.abs(occurrence.end.getTime()-endMs)>1000)return deferred('The event was edited since the widget snapshot. Preserve the newer edit and reconcile the requested time.')
 const fixed=expandEvents(events,new PlannerDate(startMs),new PlannerDate(Date.parse(target)+1)).some(o=>o.event.id!==source.id&&o.event.eventKind!=='folder'&&!o.event.allDay&&!o.event.reminder&&eventType(o.event,tags)==='fixed'&&o.start.getTime()<Date.parse(target)&&o.end.getTime()>startMs)
 if(Date.parse(target)>occurrence.end.getTime()&&fixed)return deferred('The extension conflicts with a fixed commitment. Resolve the conflict without moving a fixed commitment without user permission.')
 let next=events,selected=source
 if(source.recurrence.frequency!=='none'){
  const detached=detachEventOccurrence(events,source.id,start);next=detached.events;selected=detached.event
 }
 const updated={...selected,end:target}
 next=saveEventGroup(next,updated)
 const saved=next.find(e=>e.id===selected.id||e.mergedEventIds?.includes(selected.id))
 return {events:next,result:{applied:true,eventId:saved?.id||selected.id,end:saved?.end||target,note:'The selected occurrence end time has already been saved. Keep this duration, then reconcile later planned activities and task completion as requested. Other occurrences and fixed commitments were preserved.'}}
}
