import type {CalendarEvent} from '../types'
export type TaskScreenTimeWindow={id:string;sourceEventId:string;title:string;start:number;end:number}
export function taskScreenTimeWindow(event:CalendarEvent,start:Date,end:Date):TaskScreenTimeWindow{
 return {id:event.id+'@'+start.toISOString(),sourceEventId:event.detachedFrom||event.id,title:event.title,start:start.getTime()/1000,end:end.getTime()/1000}
}
