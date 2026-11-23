import {PlannerDate} from './timezone.js'
import {addDays,startOfDay} from './dates.js'
import type {Occurrence} from '../types.js'

/** Wall-clock minutes preserve alignment with the visible hourly ruler. */
export function timelineBounds(item:Occurrence,day:Date){
 const from=startOfDay(day).getTime(),until=addDays(startOfDay(day),1).getTime()
 const start=new PlannerDate(Math.max(from,item.start.getTime())),end=new PlannerDate(Math.min(until,item.end.getTime()))
 const minute=(date:Date)=>date.getHours()*60+date.getMinutes()+date.getSeconds()/60
 return {start:minute(start),end:end.getTime()===until?1440:Math.max(minute(start),minute(end))}
}
