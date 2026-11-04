export type TaskNotificationSettings={enabled:boolean;switches:boolean;advance:boolean;longTaskMinutes:number;minutes:number[]}
export const DEFAULT_TASK_NOTIFICATIONS:TaskNotificationSettings={enabled:false,switches:true,advance:true,longTaskMinutes:30,minutes:[5]}
export function normalizeTaskNotifications(input:Partial<TaskNotificationSettings>):TaskNotificationSettings{
 return {enabled:input.enabled===true,switches:input.switches!==false,advance:input.advance!==false,longTaskMinutes:Math.min(1440,Math.max(1,Math.round(input.longTaskMinutes||30))),minutes:[...new Set((input.minutes||[5]).filter(n=>Number.isInteger(n)&&n>=1&&n<=1440))].sort((a,b)=>b-a).slice(0,10)}
}
export type NotificationTask={id:string;title:string;start:number;end:number;isFreeTime?:boolean}
export type TaskNotice={id:string;at:number;title:string;body:string}
export function taskNotificationPlan(events:NotificationTask[],settings:TaskNotificationSettings,now:number,until:number):TaskNotice[]{
 if(!settings.enabled)return []
 const valid=events.filter(e=>e.end>e.start)
 const current=(at:number)=>valid.filter(e=>e.start<=at&&at<e.end).sort((a,b)=>Number(a.isFreeTime===true)-Number(b.isFreeTime===true)||b.start-a.start||a.end-b.end||a.id.localeCompare(b.id))[0]
 const result:TaskNotice[]=[]
 if(settings.switches)for(const at of new Set(valid.flatMap(e=>[e.start,e.end]))){
  if(at<=now||at>=until)continue
  const before=current(at-0.001),after=current(at+0.001)
  if(before?.id===after?.id)continue
  result.push({id:'switch:'+at,at,title:after?'Time to switch tasks':'Task time is over',body:after?`${before?before.title+' has ended. ':''}Now: ${after.title}`:`${before?.title||'Your task'} has ended. Now: Free time`})
 }
 if(settings.advance)for(const event of valid){
  if(event.isFreeTime||event.end-event.start<settings.longTaskMinutes*60||current(event.end-0.001)?.id!==event.id)continue
  for(const minutes of settings.minutes){const at=event.end-minutes*60
   if(at<=now||at<=event.start||at>=until||current(at)?.id!==event.id)continue
   result.push({id:`advance:${event.id}:${event.end}:${minutes}`,at,title:`${minutes} ${minutes===1?'minute':'minutes'} left`,body:event.title})
  }
 }
 return result.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
}
