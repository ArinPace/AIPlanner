import {Extension} from '@tiptap/core'
import {Plugin} from '@tiptap/pm/state'
import {Decoration,DecorationSet} from '@tiptap/pm/view'
import type {CalendarEvent} from '../types'
import {expandEvents} from './recurrence'
import {PlannerDate} from './timezone'
export type ScheduleLabels=Record<string,{text:string;title:string}>
export function checklistSchedule(events:CalendarEvent[],noteId:string,now=new PlannerDate()):ScheduleLabels{
 const start=new PlannerDate(now);start.setDate(start.getDate()-7)
 const end=new PlannerDate(now);end.setDate(end.getDate()+90)
 const candidates=new Map<string,{start:Date;end:Date}[]>()
 for(const item of expandEvents(events,start,end))for(const link of item.event.checklistLinks||[]){if(link.noteId!==noteId)continue;const slots=candidates.get(link.itemId)||[];slots.push({start:item.start,end:item.end});candidates.set(link.itemId,slots)}
 const result:ScheduleLabels={}
 for(const [id,slots] of candidates){slots.sort((a,b)=>a.start.getTime()-b.start.getTime());const next=slots.find(slot=>slot.end.getTime()>=now.getTime())||slots[slots.length-1];const day=next.start.toLocaleDateString('en-US',{month:'short',day:'numeric'}),time=next.start.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});result[id]={text:Math.abs(next.start.getTime()-now.getTime())<=2*86400000?`${day}, ${time}`:day,title:slots.map(s=>s.start.toLocaleString('en-US')+' – '+s.end.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})).join('\n')+' (New York time)'}}
 return result
}
export const ChecklistSchedule=Extension.create<{labels:()=>ScheduleLabels}>({
 name:'checklistSchedule',
 addOptions(){return {labels:()=>({})}},
 addProseMirrorPlugins(){
  const labels=this.options.labels
  return [new Plugin({props:{decorations(state){
   const decorations:Decoration[]=[]
   state.doc.descendants((node,pos)=>{
    const schedule=labels()[node.attrs.checklistId]
    if(node.type.name==='taskItem'&&schedule)decorations.push(Decoration.node(pos,pos+node.nodeSize,{'data-scheduled-label':schedule.text,title:schedule.title}))
   })
   return DecorationSet.create(state.doc,decorations)
  }}})]
 }
})
