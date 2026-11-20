import {DEFAULT_INTENSITY_CALIBRATION,type IntensityCalibration} from './intensityCalibrationModel.js'
import type {Occurrence,Tag} from '../types.js'

/** Calendar-derived estimate. Minute buckets avoid counting overlapping commitments twice. */
export function calendarIntensity(items:Occurrence[],tags:Tag[],start:number,end:number,calibration:Partial<IntensityCalibration>={}){
 const config={...DEFAULT_INTENSITY_CALIBRATION,...calibration}
 const minutes=Math.round((end-start)/60000), load=new Float64Array(minutes),sleep=new Uint8Array(minutes),ignored=new Uint8Array(minutes)
 for(const item of items){
  const e=item.event
  if(e.eventKind==='folder'||e.allDay||e.reminder)continue
  const names=tags.filter(t=>e.tagIds?.includes(t.id)).map(t=>t.name).join(' ')
  const text=e.title+' '+names
  const from=Math.max(0,Math.floor((item.start.getTime()-start)/60000)),to=Math.min(minutes,Math.ceil((item.end.getTime()-start)/60000))
  if(/\bsleep\b/i.test(e.title)||e.planning?.kind==='sleep'){for(let m=from;m<to;m++)sleep[m]=1;continue}
  if(e.difficulty===-1){for(let m=from;m<to;m++)ignored[m]=1;continue}
  if(e.difficulty===0)continue
  if(/free time|break|buffer|rest with|eyes closed/i.test(text))continue
  const effort=(e.difficulty==null?50:Math.max(1,Math.min(100,e.difficulty)))/100
  for(let m=from;m<to;m++)load[m]=Math.max(load[m],effort)
 }
 let awake=0,weighted=0,work=0,rest=0,streak=0,continuityPenalty=0,longestStreak=0
 // If no sleep is recorded, estimate a 16-hour waking day rather than treating overnight gaps as downtime.
 const hasSleep=sleep.some(Boolean)
 for(let m=0;m<minutes;m++){
  const included=!sleep[m]&&(!ignored[m]||load[m]>0)&&(hasSleep||(m>=420&&m<1380))
  if(!included){streak=0;continue}
  awake++;weighted+=load[m]
  if(load[m]){
   work++;streak++;longestStreak=Math.max(longestStreak,streak)
   // Small fatigue adjustment; occupancy remains the primary driver.
   const multiplier=Math.min(.1,Math.ceil(Math.max(0,streak-60)/5)*.005)
   continuityPenalty+=(.6+.4*load[m])*multiplier
  }else{rest++;streak=0}
 }

 const busyRatio=awake?work/awake:0
 const occupancyScore=config.busyScale*(.7*Math.min(1,work/600)+.3*busyRatio)
 const difficultyAdjustment=work?config.difficultyWeight*busyRatio*(weighted/work-.5):0
 const continuityPenaltyPoints=awake?Math.min(config.continuityCap,continuityPenalty/awake*100):0
 const score=Math.round(Math.max(0,Math.min(100,(occupancyScore+difficultyAdjustment+continuityPenaltyPoints)*config.gain+config.offset)))
 return {score,occupancyScore:Number(occupancyScore.toFixed(2)),difficultyAdjustment:Number(difficultyAdjustment.toFixed(2)),continuityPenaltyPoints:Number(continuityPenaltyPoints.toFixed(2)),longestContinuousBusyMinutes:longestStreak,summary:`${(work/60).toFixed(1)}h busy · ${(rest/60).toFixed(1)}h downtime`}
}
