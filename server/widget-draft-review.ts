import {expandEvents} from '../src/lib/recurrence.js'
import type {StoredState} from '../src/types.js'
import type {TaskFeedback} from '../src/lib/widgetTaskFeedback.js'

// Check the active rolling week, excluding folder containers and past history.
// The agent still reviews travel, deadlines, capacity and the rest of the plan.
export function widgetDraftProblems(before:StoredState,after:StoredState,feedback:TaskFeedback[]){
 if(!feedback.length)return [] as string[]
 const start=Math.min(...feedback.map(f=>f.reportedAt*1000)),end=start+7*86400000
 const rows=(state:StoredState)=>expandEvents(state.events,new Date(start),new Date(end)).filter(o=>!o.event.allDay&&!o.event.reminder&&o.event.eventKind!=='folder')
 const key=(row:ReturnType<typeof rows>[number])=>(row.event.detachedFrom||row.event.id)+'@'+row.start.getTime()
 const overlaps=(items:ReturnType<typeof rows>)=>{
  const result=new Map<string,{from:number;to:number;names:string}>()
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length&&items[j].start<items[i].end;j++){
   const a=items[i],b=items[j],from=Math.max(start,a.start.getTime(),b.start.getTime()),to=Math.min(a.end.getTime(),b.end.getTime())
   if(to>from)result.set([key(a),key(b)].sort().join('|'),{from,to,names:a.event.title+' / '+b.event.title})
  }
  return result
 }
 const old=overlaps(rows(before)),next=rows(after),problems:string[]=[]
 for(const [id,overlap] of overlaps(next)){
  const previous=old.get(id)
  if(!previous||overlap.from<previous.from-1||overlap.to>previous.to+1)problems.push('New or worsened overlap: '+overlap.names+' at '+new Date(overlap.from).toISOString())
 }
 const seen=new Set<string>()
 for(const row of next){
  const signature=JSON.stringify([row.event.title.trim().toLowerCase(),[...row.event.tagIds].sort(),row.event.scheduleType,row.start.getTime()])
  if(seen.has(signature))problems.push('Duplicate activity at the same start time: '+row.event.title+' / '+row.start.toISOString())
  seen.add(signature)
 }
 return [...new Set(problems)].slice(0,30)
}
