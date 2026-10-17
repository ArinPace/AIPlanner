import type {Occurrence, Tag} from '../types.js'
import {DEFAULT_EVENT_COLOR, isEventVisible} from './colors.js'

// Occurrences are already expanded for the visible year, including recurrence.
export function yearDaySummary(day: Date, occurrences: Occurrence[], tags: Tag[], hiddenTagIds: Set<string>) {
  const start=new Date(day.getFullYear(),day.getMonth(),day.getDate())
  const end=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1)
  const colors=new Map<string,Set<string>>()
  let count=0
  for(const item of occurrences) {
    if(item.start>=end || item.end<=start || !isEventVisible(item.event,hiddenTagIds))continue
    count++
    const visibleTags=item.event.tagIds.flatMap(id=>{
      const tag=tags.find(tag=>tag.id===id)
      return tag && !hiddenTagIds.has(id)?[tag]:[]
    })
    for(const tag of visibleTags.length?visibleTags:[{color:DEFAULT_EVENT_COLOR,name:'Untagged'}]) {
      if(!colors.has(tag.color))colors.set(tag.color,new Set())
      colors.get(tag.color)!.add(tag.name)
    }
  }
  return {count,segments:[...colors].map(([color,names])=>({color,label:[...names].join(', ')}))}
}
