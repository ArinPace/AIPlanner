import type {CalendarEvent,Occurrence} from '../types.js'
import {expandEvents} from './recurrence.js'
import {occurrenceFolderGroups,folderOccurrenceKey} from './eventFolders.js'
export function occurrenceChecked(event:CalendarEvent,start:Date){return Boolean(event.completedStarts?.some(value=>Date.parse(value)===start.getTime()))}
export function checklistLeaves(events:CalendarEvent[],id:string,start:Date):Occurrence[]{
 const source=events.find(e=>e.id===id);if(!source)return []
 const rangeEnd=new Date(start.getTime()+Math.max(60000,Date.parse(source.end)-Date.parse(source.start)))
 const expanded=expandEvents(events,new Date(start.getTime()-1),new Date(rangeEnd.getTime()+1))
 const root=expanded.find(item=>item.event.id===id&&item.start.getTime()===start.getTime());if(!root)return []
 const groups=occurrenceFolderGroups(expanded),result:Occurrence[]=[]
 function visit(item:Occurrence){if(item.event.eventKind==='folder')for(const child of groups.children.get(folderOccurrenceKey(item))||[])visit(child);else if(item.event.checklistLinks?.length)result.push(item)}
 visit(root);return result
}
export function repeatsWithAncestors(event:CalendarEvent,events:CalendarEvent[]){
 let current:CalendarEvent|undefined=event;const seen=new Set<string>()
 while(current&&!seen.has(current.id)){seen.add(current.id);if(current.recurrence.frequency!=='none')return true;current=events.find(e=>e.id===current!.folderId)}
 return false
}
