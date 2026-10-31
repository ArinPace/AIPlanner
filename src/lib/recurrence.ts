import { PlannerDate as Date } from './timezone.js'
import type { CalendarEvent, Occurrence, Recurrence } from '../types.js'
import { addDays, addMonths, addYears, daysBetween, endOfDateInput, overlaps } from './dates.js'

function customOnOrAfter(anchor:Date,from:Date,recurrence:Recurrence){
 const days=recurrence.weekdays?.length?recurrence.weekdays:[anchor.getDay()]
 let candidate=addDays(anchor,Math.max(0,daysBetween(anchor,from)))
 if(candidate<from)candidate=addDays(candidate,1)
 for(let guard=0;guard<7*recurrence.interval+7;guard++){
  const weekStart=(date:Date)=>addDays(date,-((date.getDay()-(recurrence.weekStartsOn||0)+7)%7))
  const week=Math.round(daysBetween(weekStart(anchor),weekStart(candidate))/7)
  if(week%recurrence.interval===0 && days.includes(candidate.getDay()))return candidate
  candidate=addDays(candidate,1)
 }
 return candidate
}
function nextOccurrence(date: Date, recurrence: Recurrence,anchor=date): Date {
  switch (recurrence.frequency) {
    case 'custom':
      return customOnOrAfter(anchor,addDays(date,1),recurrence)
    case 'daily':
      return addDays(date, recurrence.interval)
    case 'weekly':
      return addDays(date, 7 * recurrence.interval)
    case 'monthly':
      return addMonths(date, recurrence.interval)
    case 'yearly':
      return addYears(date, recurrence.interval)
    default:
      return addDays(date, 1)
  }
}

function firstOnOrAfter(eventStart: Date, rangeStart: Date, recurrence: Recurrence): Date {
  if(recurrence.frequency==='custom')return customOnOrAfter(eventStart,rangeStart,recurrence)
  if (eventStart >= rangeStart) return eventStart

  if (recurrence.frequency === 'daily' || recurrence.frequency === 'weekly') {
    const stepDays = recurrence.frequency === 'weekly' ? 7 * recurrence.interval : recurrence.interval
    const distance = daysBetween(eventStart, rangeStart)
    const steps = Math.ceil(distance / stepDays)
    let candidate = addDays(eventStart, steps * stepDays)
    if (candidate < rangeStart) candidate = addDays(candidate, stepDays)
    return candidate
  }

  const jump =
    recurrence.frequency === 'yearly'
      ? addYears(eventStart, Math.max(0, rangeStart.getFullYear() - eventStart.getFullYear()))
      : addMonths(
          eventStart,
          Math.max(
            0,
            (rangeStart.getFullYear() - eventStart.getFullYear()) * 12 +
              (rangeStart.getMonth() - eventStart.getMonth()),
          ),
        )

  let current = jump < eventStart ? eventStart : jump
  let guard = 0
  while (current < rangeStart && guard < 2400) {
    current = nextOccurrence(current, recurrence)
    guard += 1
  }
  return current
}

export function expandEvent(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const eventStart = new Date(event.start)
  const eventEnd = new Date(event.end)
  const duration = event.reminder && !event.allDay ? 1 : Math.max(eventEnd.getTime() - eventStart.getTime(), 60_000)
  const until = event.recurrence.until ? endOfDateInput(event.recurrence.until) : null

  if (event.recurrence.frequency === 'none') {
    if (!overlaps(eventStart, eventEnd, rangeStart, rangeEnd)) return []
    return [{ event, start: eventStart, end: eventEnd }]
  }

  const occurrences: Occurrence[] = []
  let current = firstOnOrAfter(eventStart, rangeStart, event.recurrence)
  let guard = 0

  while (current <= rangeEnd && guard < 800) {
    if (until && current > until) break
    const end = event.allDay || event.eventKind==='folder'
      ? new Date(current.getFullYear(),current.getMonth(),current.getDate()+daysBetween(eventStart,eventEnd),eventEnd.getHours(),eventEnd.getMinutes(),eventEnd.getSeconds(),eventEnd.getMilliseconds())
      : new Date(current.getTime() + duration)
    if (!(event.excludedStarts||[]).some(value=>Date.parse(value)===current.getTime()) && !(event.inheritedExcludedStarts||[]).some(value=>Date.parse(value)===current.getTime()) && overlaps(current, end, rangeStart, rangeEnd)) {
      occurrences.push({ event, start: current, end })
    }
    current = nextOccurrence(current, event.recurrence,eventStart)
    guard += 1
  }

  return occurrences
}

export function expandEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const byId=new Map(events.map(event=>[event.id,event])),children=new Map<string,CalendarEvent[]>()
  for(const event of events){if(event.folderId && byId.get(event.folderId)?.eventKind==='folder'){const list=children.get(event.folderId)||[];list.push(event);children.set(event.folderId,list)}}
  const result:Occurrence[]=[]
  function shifted(date:string,base:Date,target:Date){const original=new Date(date);const moved=addDays(original,daysBetween(base,target));moved.setHours(original.getHours(),original.getMinutes(),original.getSeconds(),original.getMilliseconds());return moved}
  function visit(event:CalendarEvent,parent?:Occurrence,ancestry=new Set<string>()){
    if(ancestry.has(event.id))return
    const path=new Set(ancestry);path.add(event.id)
    const occurrences:Occurrence[]=parent?[{event,folderOccurrenceKey:parent.event.recurrence.frequency==='none'?parent.event.id:parent.event.id+'@'+parent.start.toISOString(),start:shifted(event.start,new Date(parent.event.start),parent.start),end:shifted(event.end,new Date(parent.event.start),parent.start)}]:expandEvent(event,addDays(rangeStart,-Math.max(1,Math.ceil((Date.parse(event.end)-Date.parse(event.start))/86400000))),rangeEnd)
    for(const item of occurrences){
      if([...(event.excludedStarts||[]),...(event.inheritedExcludedStarts||[])].some(value=>Date.parse(value)===item.start.getTime()))continue
      if(overlaps(item.start,item.end,rangeStart,rangeEnd))result.push(item)
      for(const child of children.get(event.id)||[])visit(child,item,path)
    }
  }
  for(const event of events)if(!event.folderId || !children.get(event.folderId)?.includes(event))visit(event)
  return result.sort((a,b)=>a.start.getTime()-b.start.getTime()||a.end.getTime()-b.end.getTime())
}

export function recurrenceLabel(recurrence: Recurrence): string {
  if (recurrence.frequency === 'none') return 'Does not repeat'

  if(recurrence.frequency==='custom'){const days=(recurrence.weekdays||[]).map(day=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).join(', ');return 'Every '+(recurrence.interval===1?'week':recurrence.interval+' weeks')+' on '+days+(recurrence.until?' until '+recurrence.until:'')}
  const interval = recurrence.interval
  const unit = {
    daily: interval === 1 ? 'day' : 'days',
    weekly: interval === 1 ? 'week' : 'weeks',
    monthly: interval === 1 ? 'month' : 'months',
    yearly: interval === 1 ? 'year' : 'years',
  }[recurrence.frequency]

  const every = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}`
  return recurrence.until ? `${every} until ${recurrence.until}` : every
}
