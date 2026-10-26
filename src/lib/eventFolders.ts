import type {CalendarEvent,Occurrence} from '../types.js'

// Folder containers never replace the real events they group.
export function normalizeEventFolders(events:CalendarEvent[]):CalendarEvent[]{
 const folders=new Set(events.filter(e=>e.eventKind==='folder').map(e=>e.id))
 const normalized=events.map(event=>event.folderId&&!folders.has(event.folderId)?{...event,folderId:null}:event)
 return normalized.map(folder=>{
  if(folder.eventKind!=='folder')return folder
  const children=normalized.filter(e=>e.folderId===folder.id)
  if(!children.length)return folder
  const start=Math.min(...children.map(e=>Date.parse(e.start)))
  return {...folder,start:new Date(start).toISOString(),end:new Date(Math.max(start+60000,...children.map(e=>Date.parse(e.end)))).toISOString()}
 })
}
export function validateEventFolders(events:CalendarEvent[]){
 for(const event of events){
  if(event.eventKind==='folder'&&event.planning)throw Error('Create a new folder and move the existing planning event into it; keep task links on the real event.')
  if(event.eventKind==='folder'&&(event.folderId||event.allDay||event.reminder||event.recurrence.frequency!=='none'))throw Error('Folders group dated, timed events and cannot repeat or be nested.')
  if(!event.folderId)continue
  if(event.folderId===event.id||!events.some(e=>e.id===event.folderId&&e.eventKind==='folder'))throw Error('Choose an existing event folder.')
  if(event.allDay||event.recurrence.frequency!=='none')throw Error('Events inside a folder must be timed and non-recurring.')
 }
}
export function occurrenceFolderGroups(occurrences:Occurrence[]){
 const children=new Map<string,Occurrence[]>()
 const parents=new Map(occurrences.filter(item=>item.event.eventKind==='folder').map(item=>[item.event.id,item]))
 const top:Occurrence[]=[]
 for(const item of occurrences){
  const parent=item.event.folderId?parents.get(item.event.folderId):undefined
  // If filters hide the folder, or a source moves a child out of its range,
  // keep the child visible as a standalone event rather than losing it.
  if(parent&&item.start>=parent.start&&item.end<=parent.end){
   const list=children.get(parent.event.id)||[];list.push(item);children.set(parent.event.id,list)
  }else top.push(item)
 }
 for(const list of children.values())list.sort((a,b)=>a.start.getTime()-b.start.getTime())
 return {top,children}
}
export function folderExpanded(item:Occurrence,now:number,opened:ReadonlySet<string>){
 return opened.has(item.event.id)||(item.start.getTime()<=now&&now<item.end.getTime())
}
export function saveEventGroup(events:CalendarEvent[],event:CalendarEvent,children?:CalendarEvent[]){
 const previous=events.find(item=>item.id===event.id)
 const merge=(next:CalendarEvent)=>{const old=events.find(item=>item.id===next.id);const changed=old&&['title','description','start','end','allDay','reminder'].some(key=>old[key as keyof CalendarEvent]!==next[key as keyof CalendarEvent]);return {...old,...next,...(old?.planning?{planning:{...old.planning,locked:old.planning.locked||Boolean(changed)}}:{})}}
 const ids=new Set([event.id,...(children||[]).map(item=>item.id)])
 const kept=events.filter(item=>!ids.has(item.id)).map(item=>item.folderId===event.id&&(event.eventKind!=='folder'||children&&!children.some(child=>child.id===item.id))?{...item,folderId:null}:item)
 const saved=merge({...event,folderId:previous?.folderId||null})
 const next=normalizeEventFolders([...kept,saved,...(children||[]).map(child=>merge({...child,folderId:event.id}))])
 validateEventFolders(next)
 return next
}
