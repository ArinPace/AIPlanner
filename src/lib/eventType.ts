import type {CalendarEvent,Tag} from '../types.js'
export type ScheduleType='fixed'|'planned'
export function eventType(event:CalendarEvent,tags:Tag[]=[]):ScheduleType{
 if(event.scheduleType==='fixed'||event.scheduleType==='planned')return event.scheduleType
 if(event.planning)return 'planned'
 const names=event.tagIds.map(id=>tags.find(tag=>tag.id===id)?.name.toLowerCase().trim()||'')
 if(names.some(name=>/^(to[- ]?do|maintenance|maintaince|breaks?|buffers?)$/.test(name)))return 'planned'
 return 'fixed'
}
