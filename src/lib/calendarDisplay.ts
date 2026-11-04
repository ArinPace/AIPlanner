import type {Occurrence} from '../types'
export type CalendarDisplay={week:boolean;month:boolean}
export const defaultCalendarDisplay:CalendarDisplay={week:false,month:false}
export function durationHeight(item:Occurrence,view:'week'|'month',zoom:number,dayStart:number,dayEnd:number):number|undefined{
 if(item.event.allDay||item.event.reminder)return undefined
 const minutes=Math.max(0,Math.min(item.end.getTime(),dayEnd)-Math.max(item.start.getTime(),dayStart))/60000
 return Math.max((view==='week'?36:24)*zoom,minutes*(view==='week'?1:0.5)*zoom)
}
