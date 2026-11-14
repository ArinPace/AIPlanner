import type {CalendarEvent} from '../types'
export type TaskScreenTimeWindow={id:string;sourceEventId:string;title:string;start:number;end:number}
export function taskScreenTimeWindow(event:CalendarEvent,start:Date,end:Date):TaskScreenTimeWindow{
 const completed=event.completedStarts?.some(value=>Date.parse(value)===start.getTime())
 if(completed)return {id:'free-time:completed:'+event.id+'@'+start.toISOString(),sourceEventId:'free-time:completed:'+event.id,title:'Free time',start:start.getTime()/1000,end:end.getTime()/1000}
 return {id:event.id+'@'+start.toISOString(),sourceEventId:event.detachedFrom||event.id,title:event.title,start:start.getTime()/1000,end:end.getTime()/1000}
}
