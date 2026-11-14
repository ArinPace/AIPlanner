import type {Occurrence,Tag} from '../types'

/** Calendar-derived estimate. Minute buckets avoid counting overlapping commitments twice. */
export function calendarIntensity(items:Occurrence[],tags:Tag[],start:number,end:number){
 const minutes=Math.round((end-start)/60000), load=new Float64Array(minutes),sleep=new Uint8Array(minutes)
 for(const item of items){
  const e=item.event
  if(e.eventKind==='folder'||e.allDay||e.reminder)continue
  const names=tags.filter(t=>e.tagIds?.includes(t.id)).map(t=>t.name).join(' ')
  const text=e.title+' '+names
  const from=Math.max(0,Math.floor((item.start.getTime()-start)/60000)),to=Math.min(minutes,Math.ceil((item.end.getTime()-start)/60000))
  if(/^sleep\b/i.test(e.title)){for(let m=from;m<to;m++)sleep[m]=1;continue}
  if(/free time|break|buffer|rest with|eyes closed/i.test(text))continue
  const duration=(item.end.getTime()-item.start.getTime())/60000
  const academic=/homework|studying|class|quiz|test|exam|assignment|research|project|presentation|practice|reading/i.test(text)
  const effort=academic?1+Math.min(.5,duration/240):.55+Math.min(.2,duration/600)
  for(let m=from;m<to;m++)load[m]=Math.max(load[m],effort)
 }
 let awake=0,weighted=0,work=0,rest=0
 // If no sleep is recorded, estimate a 16-hour waking day rather than treating overnight gaps as downtime.
 const hasSleep=sleep.some(Boolean)
 for(let m=0;m<minutes;m++)if(!sleep[m]&&(hasSleep||(m>=420&&m<1380))){awake++;weighted+=load[m];if(load[m])work++;else rest++}
 const score=awake?Math.round(Math.min(100,weighted/awake*100)):0
 return {score,summary:`${(work/60).toFixed(1)}h busy · ${(rest/60).toFixed(1)}h downtime`}
}
