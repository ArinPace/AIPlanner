import type {CalendarEvent,Tag} from '../types.js'
import {detachEventOccurrence, folderOccurrenceKey, saveEventGroup} from './eventFolders.js'
import {expandEvents} from './recurrence.js'
import {PlannerDate} from './timezone.js'
import {widgetSnapshot} from './widgetSnapshot.js'
import {eventType} from './eventType.js'

export type TaskFeedback={id:string;task:{id:string;title:string;start:number;end:number;planningTaskId?:string;sourceEventId?:string};remainingMinutes:number;done:boolean;reportedAt:number;requestedEnd?:number;kind?:'fillFreeTime'}
export type TaskTimeResult={applied:boolean;eventId?:string;end?:string;note:string}
export function resizeWidgetOccurrence(events:CalendarEvent[], feedback:TaskFeedback,tags:Tag[]=[]):{events:CalendarEvent[];result:TaskTimeResult} {
 const {task,reportedAt,remainingMinutes,done}=feedback
 if(!Number.isFinite(reportedAt)||!Number.isSafeInteger(remainingMinutes)||remainingMinutes<0)throw new Error('Invalid remaining time.')
 const startMs=Math.round(task.start*1000),endMs=Math.round(task.end*1000)
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)throw new Error('Invalid activity time.')
 const separator=task.id.lastIndexOf('@'),id=separator<0?task.id:task.id.slice(0,separator)
 if(feedback.requestedEnd!==undefined&&(!Number.isFinite(feedback.requestedEnd)||Math.abs(feedback.requestedEnd-(reportedAt+(done?0:remainingMinutes*60)))>61))throw new Error('Invalid requested end time.')
 const target=new Date(Math.max(startMs+1000,(done?reportedAt:feedback.requestedEnd??reportedAt+remainingMinutes*60)*1000)).toISOString()
 const deferred=(note:string)=>({events,result:{applied:false,note}})
 // A retry after a successful, but unacknowledged, recurring edit reuses its standalone occurrence.
 const source=events.find(e=>e.detachedFrom===id&&Date.parse(e.start)===startMs)||events.find(e=>e.id===id)
 if(!source||source.allDay||source.reminder||source.eventKind==='folder')return deferred('The original occurrence is no longer available. Reconcile this feedback against current calendar/history without guessing or changing the series.')
 const occurrences=expandEvents(events,new PlannerDate(startMs-1),new PlannerDate(Math.max(endMs,Date.parse(target))+1))
 const occurrence=occurrences.find(o=>o.event.id===source.id&&o.start.getTime()===startMs)
 if(!occurrence)return deferred('The occurrence has changed or was removed. Review current state/history before applying the feedback.')
 if(occurrence.end.getTime()===Date.parse(target))return {events,result:{applied:true,eventId:source.id,end:target,note:'This occurrence already has the requested end time.'}}
 if(Math.abs(occurrence.end.getTime()-endMs)>1000)return deferred('The event was edited since the widget snapshot. Preserve the newer edit and reconcile the requested time.')
 const fixed=expandEvents(events,new PlannerDate(startMs),new PlannerDate(Date.parse(target)+1)).some(o=>o.event.id!==source.id&&o.event.eventKind!=='folder'&&!o.event.allDay&&!o.event.reminder&&eventType(o.event,tags)==='fixed'&&o.start.getTime()<Date.parse(target)&&o.end.getTime()>startMs)
 if(Date.parse(target)>occurrence.end.getTime()&&fixed)return deferred('The extension conflicts with a fixed commitment. Resolve the conflict without moving a fixed commitment without user permission.')
 let next=events,selected=source
 if(source.recurrence.frequency!=='none'){
  // A date-specific edit belongs inside the same folder tree. Replacing the
  // containing folder occurrence prevents the old container keeping an empty gap.
  let root=occurrence
  const visited=new Set<string>()
  while(root.event.folderId){
   if(visited.has(root.event.id))return deferred('The folder hierarchy needs repair before this time can be changed.')
   visited.add(root.event.id)
   const child=root
   const parent=occurrences.find(item=>item.event.id===child.event.folderId&&folderOccurrenceKey(item)===child.folderOccurrenceKey)
   if(!parent)return deferred('The containing folder occurrence is no longer available. Keep the activity grouped when reconciling this feedback.')
   root=parent
  }
  if(root.event.recurrence.frequency==='none')return deferred('The folder repeat settings changed. Reconcile this occurrence without creating a duplicate.')
  const detached=detachEventOccurrence(events,root.event.id,root.start.toISOString())
  next=detached.events
  const replacement=root.event.id===source.id?detached.event:next.find(item=>item.detachedFrom===source.id&&Date.parse(item.start)===startMs)
  if(!replacement)throw new Error('Could not preserve this activity inside its folder. Nothing was saved.')
  selected=replacement
 }
 const updated={...selected,end:target}
 next=saveEventGroup(next,updated)
 const saved=next.find(e=>e.id===selected.id||e.mergedEventIds?.includes(selected.id))
 return {events:next,result:{applied:true,eventId:saved?.id||selected.id,end:saved?.end||target,note:'The selected occurrence end time has already been saved. Update this existing event ID in place for any further edits; do not create another copy or move it out of its folder. Keep this duration, then reconcile later planned activities and task completion as requested. Other occurrences and fixed commitments were preserved.'}}
}

export function verifyFreeTimeRequest(events:CalendarEvent[],tags:Tag[],feedback:TaskFeedback,now=new Date()):TaskTimeResult {
 if(now.getTime()>=feedback.task.end*1000||now.getTime()<feedback.reportedAt*1000-1000)throw new Error('That free-time slot has ended. Dismiss this request and use the widget during a new free slot.')
 const snapshot=widgetSnapshot(events,now,tags),time=now.getTime()/1000
 const active=snapshot.events.filter(e=>e.start<=time&&time<e.end)
 if(active.some(e=>!e.isFreeTime))throw new Error('You have a scheduled activity now. This button only works during free time.')
 const midnight=new PlannerDate(now);midnight.setHours(24,0,0,0)
 const end=Math.min(feedback.task.end,midnight.getTime()/1000,...snapshot.events.filter(e=>!e.isFreeTime&&e.start>time).map(e=>e.start),...active.map(e=>e.end))
 if(end<=time)throw new Error('There is no remaining free time in this slot.')
 return {applied:false,end:new Date(end*1000).toISOString(),note:'Verified free time from '+now.toISOString()+' until '+new Date(end*1000).toISOString()+'. No event has been changed by the widget.'}
}
