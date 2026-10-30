import type {CalendarEvent,Occurrence} from '../types.js'

// Folder containers never replace the real events they group.
export function normalizeEventFolders(events:CalendarEvent[]):CalendarEvent[]{
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
  if(!parent)return event
  const owner=inherited(parent)
  return {...event,recurrence:{...owner.recurrence}}
 }
 return bounded.map(inherited)
}
export function validateEventFolders(events:CalendarEvent[]){
 for(const event of events){
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
