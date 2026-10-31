import {expandEvents} from './recurrence.js'
import {PlannerDate} from './timezone.js'
import {addDays,daysBetween,toDateInput} from './dates.js'
import type {CalendarEvent,Occurrence} from '../types.js'

// Folder containers never replace the real events they group.
export function normalizeEventFolders(events:CalendarEvent[]):CalendarEvent[]{
 events=mergeAdjacentEvents(events)
 const folders=new Set(events.filter(e=>e.eventKind==='folder').map(e=>e.id))
 const normalized=events.map(event=>event.folderId&&!folders.has(event.folderId)?{...event,folderId:null}:event)
 const resolved=new Map<string,CalendarEvent>(),visiting=new Set<string>()
 function resolve(event:CalendarEvent):CalendarEvent{
  if(resolved.has(event.id))return resolved.get(event.id)!
  if(visiting.has(event.id))throw Error('An event folder cannot contain itself or one of its parent folders.')
  visiting.add(event.id)
  const children=event.eventKind==='folder'?normalized.filter(e=>e.folderId===event.id).map(resolve):[]
  let result=event
  if(children.length){const start=Math.min(...children.map(e=>Date.parse(e.start)));result={...event,start:new Date(start).toISOString(),end:new Date(Math.max(start+60000,...children.map(e=>Date.parse(e.end)))).toISOString()}}
  visiting.delete(event.id);resolved.set(event.id,result);return result
 }
 const bounded=normalized.map(resolve),byId=new Map(bounded.map(event=>[event.id,event]))
 function inherited(event:CalendarEvent):CalendarEvent{
  const parent=event.folderId?byId.get(event.folderId):undefined
  if(!parent){const {inheritedExcludedStarts:_excluded,...standalone}=event;return standalone}
  const owner=inherited(parent)
  const excluded=[...(owner.excludedStarts||[]),...(owner.inheritedExcludedStarts||[])].map(value=>addDays(new PlannerDate(event.start),daysBetween(new PlannerDate(owner.start),new PlannerDate(value))).toISOString())
  const offset=daysBetween(new PlannerDate(owner.start),new PlannerDate(event.start)),shift=(day:number)=>(day+offset%7+7)%7
  return {...event,recurrence:{...owner.recurrence,...(owner.recurrence.until&&offset?{until:toDateInput(addDays(new PlannerDate(owner.recurrence.until+'T12:00:00'),offset))}:{}),...(owner.recurrence.frequency==='custom'?{weekdays:owner.recurrence.weekdays?.map(shift).sort(),weekStartsOn:shift(owner.recurrence.weekStartsOn||0)}:{})},inheritedExcludedStarts:excluded.length?excluded:undefined}
 }
 return bounded.map(inherited)
}
export function validateEventFolders(events:CalendarEvent[]){
 for(const event of events){
  if(event.recurrence.frequency==='custom'&&(!event.recurrence.weekdays?.length||event.recurrence.weekdays.length>7||event.recurrence.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)))throw Error('Choose at least one valid weekday for custom repeats.')
  if(event.excludedStarts!==undefined&&(!Array.isArray(event.excludedStarts)||event.excludedStarts.length>5000||event.excludedStarts.some(value=>typeof value!=='string'||!Number.isFinite(Date.parse(value)))))throw Error('Invalid excluded occurrence starts.')
  if(event.eventKind==='folder'&&event.planning)throw Error('Create a new folder and move the existing planning event into it; keep task links on the real event.')
  if(event.eventKind==='folder'&&(event.allDay||event.reminder))throw Error('Folders group dated, timed events.')
  if(!event.folderId)continue
  if(event.folderId===event.id||!events.some(e=>e.id===event.folderId&&e.eventKind==='folder'))throw Error('Choose an existing event folder.')
  if(event.allDay)throw Error('Events inside a folder must be timed.')
 }
 normalizeEventFolders(events) // Validate the full ancestry, including indirect cycles.
}
export function folderOccurrenceKey(item:Occurrence){return item.event.recurrence.frequency==='none'?item.event.id:item.event.id+'@'+item.start.toISOString()}
export function occurrenceFolderGroups(occurrences:Occurrence[]){
 const children=new Map<string,Occurrence[]>()
 const parents=new Map<string,Occurrence[]>()
 for(const item of occurrences.filter(item=>item.event.eventKind==='folder')){const list=parents.get(item.event.id)||[];list.push(item);parents.set(item.event.id,list)}
 const top:Occurrence[]=[]
 for(const item of occurrences){
  const parent=item.event.folderId?parents.get(item.event.folderId)?.find(parent=>item.folderOccurrenceKey?folderOccurrenceKey(parent)===item.folderOccurrenceKey:item.start>=parent.start&&item.end<=parent.end):undefined
  // If filters hide the folder, or a source moves a child out of its range,
  // keep the child visible as a standalone event rather than losing it.
  if(parent&&item.start>=parent.start&&item.end<=parent.end){
   const list=children.get(folderOccurrenceKey(parent))||[];list.push(item);children.set(folderOccurrenceKey(parent),list)
  }else top.push(item)
 }
 for(const list of children.values())list.sort((a,b)=>a.start.getTime()-b.start.getTime())
 return {top,children}
}
export function folderExpanded(item:Occurrence,now:number,opened:ReadonlySet<string>){
 return opened.has(folderOccurrenceKey(item))||(item.start.getTime()<=now&&now<item.end.getTime())
}
export function saveEventGroup(events:CalendarEvent[],event:CalendarEvent,children?:CalendarEvent[]){
 const previous=events.find(item=>item.id===event.id)
 const merge=(next:CalendarEvent)=>{const old=events.find(item=>item.id===next.id);const changed=old&&['title','description','start','end','allDay','reminder'].some(key=>old[key as keyof CalendarEvent]!==next[key as keyof CalendarEvent]);return {...old,...next,...(old?.planning?{planning:{...old.planning,locked:old.planning.locked||Boolean(changed)}}:{})}}
 const ids=new Set([event.id,...(children||[]).map(item=>item.id)])
 const editedParents=new Set([event.id,...(children||[]).filter(item=>item.eventKind==='folder').map(item=>item.id)])
 const kept=events.filter(item=>!ids.has(item.id)).map(item=>item.folderId&&editedParents.has(item.folderId)?{...item,folderId:null}:item)
 const saved=merge({...event,folderId:event.folderId!==undefined?event.folderId:previous?.folderId||null})
 const next=normalizeEventFolders([...kept,saved,...(children||[]).map(child=>merge({...child,folderId:child.folderId??event.id}))])
 validateEventFolders(next)
 return next
}

export function mergeAdjacentEvents(events:CalendarEvent[]):CalendarEvent[]{
 const result:CalendarEvent[]=[],redirects=new Map<string,string>()
 const comparable=(event:CalendarEvent)=>JSON.stringify([event.title,[...event.tagIds].sort(),event.folderId||null,event.scheduleType||null,event.planning||null,event.recurrence,[...(event.excludedStarts||[])].map(Date.parse).sort(),[...(event.inheritedExcludedStarts||[])].map(Date.parse).sort()])
 for(const event of [...events].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))){
  const previous=[...result].reverse().find(item=>Date.parse(item.end)===Date.parse(event.start)&&!item.allDay&&!item.reminder&&item.eventKind!=='folder'&&comparable(item)===comparable(event)&&(event.recurrence.frequency==='none'||toDateInput(new PlannerDate(item.start))===toDateInput(new PlannerDate(event.start))))
  if(previous&&!event.allDay&&!event.reminder&&event.eventKind!=='folder'){
   previous.end=event.end
   previous.description=[...new Set([previous.description,event.description].filter(Boolean).flatMap(value=>value.split('\n\n')))].join('\n\n')
   previous.urgency=Math.max(previous.urgency??0,event.urgency??0)||previous.urgency
   previous.mergedEventIds=[...new Set([...(previous.mergedEventIds||[]),event.id,...(event.mergedEventIds||[])])]
   redirects.set(event.id,previous.id)
  }else result.push({...event})
 }
 return result.map(event=>({...event,...(event.planning?.bufferForEventId&&redirects.has(event.planning.bufferForEventId)?{planning:{...event.planning,bufferForEventId:redirects.get(event.planning.bufferForEventId)}}:{})}))
}

export function eventRemovalIds(events:CalendarEvent[],ids:string[],includeFolderContents=false){
 const selected=new Set(ids),parents=new Set(events.filter(event=>selected.has(event.id)&&event.eventKind==='folder'&&(includeFolderContents||event.recurrence.frequency!=='none'||Boolean(event.detachedFrom))).map(event=>event.id))
 let changed=true
 while(changed){changed=false;for(const event of events)if(event.folderId&&parents.has(event.folderId)&&!selected.has(event.id)){selected.add(event.id);if(event.eventKind==='folder')parents.add(event.id);changed=true}}
 return selected
}
export function removeEventSeries(events:CalendarEvent[],ids:string[]){
 const selected=eventRemovalIds(events,ids)
 return normalizeEventFolders(events.filter(event=>!selected.has(event.id)).map(event=>event.folderId&&selected.has(event.folderId)?{...event,folderId:null}:event))
}

export function detachEventOccurrence(events:CalendarEvent[],id:string,start:string){
 const instant=Date.parse(start),source=events.find(event=>event.id===id)
 if(!source||source.recurrence.frequency==='none'||!Number.isFinite(instant))throw Error('Select an exact occurrence of a recurring event.')
 const selected=eventRemovalIds(events,[id],true),occurrences=expandEvents(events,new PlannerDate(instant-1),new PlannerDate(instant+Math.max(60000,Date.parse(source.end)-Date.parse(source.start))+86400000))
 const occurrence=occurrences.find(item=>item.event.id===id&&item.start.getTime()===instant)
 if(!occurrence)throw Error('The selected occurrence is no longer available.')
 const included:Occurrence[]=[occurrence]
 for(let index=0;index<included.length;index++){const parent=included[index];included.push(...occurrences.filter(item=>selected.has(item.event.id)&&item.event.folderId===parent.event.id&&item.folderOccurrenceKey===folderOccurrenceKey(parent)))}
 const ids=new Map(included.map(item=>[item.event.id,crypto.randomUUID()]))
 const detached=included.map(item=>{
  const {excludedStarts:_excluded,inheritedExcludedStarts:_inherited,mergedEventIds:_merged,...base}=item.event
  return {...base,id:ids.get(item.event.id)!,detachedFrom:item.event.id,start:item.start.toISOString(),end:item.end.toISOString(),folderId:item.event.id===id?null:ids.get(item.event.folderId||'')||null,recurrence:{frequency:'none' as const,interval:1,until:null},...(item.event.planning?{planning:{...item.event.planning,locked:true,bufferForEventId:ids.get(item.event.planning.bufferForEventId||'')||item.event.planning.bufferForEventId}}:{})}
 })
 const next=normalizeEventFolders([...events.map(event=>event.id===id?{...event,excludedStarts:[...new Set([...(event.excludedStarts||[]),new Date(instant).toISOString()])]}:event),...detached])
 return {events:next,event:next.find(event=>event.id===ids.get(id)||event.mergedEventIds?.includes(ids.get(id)!))!}
}
