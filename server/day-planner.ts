import {removeCompletedTodoBlocks} from './todo-completion.js'
import {randomUUID} from 'node:crypto'
import {PlannerDate as Date} from '../src/lib/timezone.js'
import {addDays,toDateInput} from '../src/lib/dates.js'
import {expandEvents} from '../src/lib/recurrence.js'
import {intensityFor,type PlanningProfile,type PlanningTask} from '../src/lib/planning.js'
import type {CalendarEvent} from '../src/types.js'
import {eventType} from '../src/lib/eventType.js'
import {normalizeEventFolders} from '../src/lib/eventFolders.js'

const minute=60000
const academic=(task:PlanningTask)=>/study|academic|homework|assignment|college|quiz|exam|test|reading/i.test(task.category)
const personal=(task:PlanningTask)=>!task.deadline&&!academic(task)
export function buildDayPlan(profile:PlanningProfile,events:CalendarEvent[],date:string,count:number,now=new Date()){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.wake)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.sleep)||profile.sleep<=profile.wake)throw new Error('Confirm this user\'s wake/sleep routine in Main Chat before building their day.')
 const start=new Date(date+'T00:00:00'),end=addDays(start,count)
 const completed=new Set(profile.tasks.filter(task=>task.status==='done').map(task=>task.id))
 // A missing task record (for example after a chat reset) is not permission
 // to discard its calendar allocation. Keep it fixed until reconciled.
 const retained=removeCompletedTodoBlocks(events,completed,now.getTime()).filter(event=>event.recurrence.frequency!=='none' || eventType(event)==='fixed' || !event.planning || event.planning.locked || (event.planning.kind==='task'&&!profile.tasks.some(task=>task.id===event.planning?.taskId)) || new Date(event.start)<now || new Date(event.start)<start || new Date(event.start)>=end)
 const fixed=expandEvents(retained.filter(e=>!e.reminder&&e.eventKind!=='folder'),start,end)
 const remaining=new Map(profile.tasks.filter(t=>t.status==='todo').map(t=>[t.id,Math.max(5,Math.round(t.minutes*(profile.learning[t.category]?.ratio ?? 1)))]))
 // Preserve work already allocated outside the range being rebuilt.
 for(const event of retained){if(event.planning?.taskId && new Date(event.end)>now){const id=event.planning.taskId;remaining.set(id,Math.max(0,(remaining.get(id)||0)-(new Date(event.end).getTime()-new Date(event.start).getTime())/minute))}}
 const planned:CalendarEvent[]=[],warnings:string[]=[]
 function add(title:string,a:number,b:number,kind:'task'|'break'|'routine'|'sleep',taskId?:string,urgency?:number){
  if(b<=a)return
  planned.push({id:randomUUID(),scheduleType:'planned',title,description:(taskId?'Planned work. Tell Main Chat when completed, missed, or if the estimate was wrong.':'Planned '+kind+'. Adjust your preferences in Main Chat.')+(!profile.onboarded?' Provisional plan: routine windows and durations may be estimates; refine them in Main Chat.':''),start:new Date(a).toISOString(),end:new Date(b).toISOString(),allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null},urgency,planning:{kind,taskId,locked:false}})
 }
 for(let offset=0;offset<count;offset++){
  const day=addDays(start,offset),key=toDateInput(day),dayEnd=addDays(day,1).getTime()
  const clock=(time:string)=>{const [h,m]=time.split(':').map(Number);return new Date(day.getFullYear(),day.getMonth(),day.getDate(),h,m).getTime()}
  const wake=clock(profile.wake),sleep=clock(profile.sleep),intensity=intensityFor(profile,key,day.getDay())
  const routines=[
   {title:'Get ready for the day',start:wake,end:Math.min(sleep,wake+profile.readyMinutes*minute)},
   {title:'Wind down / get ready for bed',start:Math.max(wake,sleep-profile.windDownMinutes*minute),end:sleep},
   ...profile.meals.map(meal=>({...meal,start:clock(meal.time),end:clock(meal.time)+meal.minutes*minute})),
  ].filter(routine=>routine.end>routine.start).sort((a,b)=>a.start-b.start)
  const focus=120,rest=10,buffer=Math.round(10-intensity*.07)
  const coreLimit=intensity<50?1:intensity<75?2:3,coreTasks=new Set<string>(),tinyTasks=new Set<string>()
  for(const event of retained.filter(e=>Date.parse(e.end)>Math.max(day.getTime(),now.getTime())&&Date.parse(e.start)<dayEnd)){
   const task=profile.tasks.find(task=>task.id===event.planning?.taskId)
   if(task&&task.status==='todo'&&personal(task))(task.minutes<=15?tinyTasks:coreTasks).add(task.id)
  }
  let workBudget=Math.round((sleep-wake)/minute*.75*intensity/100)
  const busy=fixed.filter(e=>e.start.getTime()<dayEnd&&e.end.getTime()>day.getTime()).map(e=>({a:Math.max(day.getTime(),e.start.getTime()-buffer*minute),b:Math.min(dayEnd,e.end.getTime()+buffer*minute)})).sort((a,b)=>a.a-b.a)
  for(const commitment of fixed.filter(e=>e.start.getTime()<dayEnd&&e.end.getTime()>day.getTime())){
   const transitions=[{a:commitment.start.getTime()-buffer*minute,b:commitment.start.getTime(),title:'Prepare / transition to next commitment'},{a:commitment.end.getTime(),b:commitment.end.getTime()+buffer*minute,title:'Settle in / take a breath after commitment'}]
   for(const transition of transitions){
    let pieces=[{a:Math.max(transition.a,day.getTime(),now.getTime()),b:Math.min(transition.b,dayEnd)}].filter(p=>p.b>p.a)
    for(const blocker of [...fixed,...planned.map(event=>({start:new Date(event.start),end:new Date(event.end)}))]){
     const a=blocker.start.getTime(),b=blocker.end.getTime()
     pieces=pieces.flatMap(p=>b<=p.a||a>=p.b?[p]:[{a:p.a,b:Math.min(a,p.b)},{a:Math.max(b,p.a),b:p.b}].filter(piece=>piece.b>piece.a))
    }
    for(const piece of pieces)add(transition.title,piece.a,piece.b,'routine')
   }
  }
  // Fixed commitments, including their transition buffers, come before flexible work.
  const free:{a:number;b:number}[]=[];let cursor=Math.max(day.getTime(),now.getTime())
  for(const interval of busy){if(interval.a>cursor)free.push({a:cursor,b:interval.a});cursor=Math.max(cursor,interval.b)}
  if(cursor<dayEnd)free.push({a:cursor,b:dayEnd})
  let lastCategory=''
  for(const slot of free){
   let a=slot.a
   while(a<slot.b){
    if(a<wake || a>=sleep){const b=Math.min(slot.b,a<wake?wake:dayEnd);add('Sleep',a,b,'sleep');a=b;continue}
    const awakeEnd=Math.min(slot.b,sleep)
    const routine=routines.find(routine=>a>=routine.start&&a<routine.end)
    if(routine){const b=Math.min(awakeEnd,routine.end);add(routine.title,a,b,'routine');a=b;continue}
    const nextRoutine=routines.map(routine=>routine.start).find(t=>t>a)
    const limit=Math.min(awakeEnd,nextRoutine ?? awakeEnd)
    const available=(limit-a)/minute
    const eligible=profile.tasks.filter(t=>t.status==='todo'&&(remaining.get(t.id)||0)>0&&(!t.preferredDays.length||t.preferredDays.includes(day.getDay()))&&(!t.earliestDate||t.earliestDate<=key)&&(!t.deadline||new Date(t.deadline).getTime()>a)&&(!personal(t)||coreTasks.has(t.id)||tinyTasks.has(t.id)||(t.minutes<=15?tinyTasks.size<2:coreTasks.size<coreLimit)))
    eligible.sort((x,y)=>{
     if(Boolean(x.deadline)!==Boolean(y.deadline))return x.deadline?-1:1
     const due=(x.deadline?new Date(x.deadline).getTime():Infinity)-(y.deadline?new Date(y.deadline).getTime():Infinity)
     return (Number.isFinite(due)&&due!==0?due:0)||y.urgency-x.urgency||Number(x.category===lastCategory)-Number(y.category===lastCategory)
    })
    const task=eligible.find(t=>(workBudget>=5||(intensity>0&&Boolean(t.deadline)))&&(!t.deadline||(new Date(t.deadline).getTime()-a)/minute>=5))
    if(task&&available>=10){
     const beforeDue=task.deadline?(new Date(task.deadline).getTime()-a)/minute:Infinity
     const session=/study|quiz|exam|test/i.test(task.category)?focus:Infinity
     const work=Math.min(remaining.get(task.id)!,session,available,beforeDue,task.deadline&&intensity>0?available:workBudget)
     if(work>=5){const b=a+work*minute;add(task.title,a,b,'task',task.id,task.urgency);remaining.set(task.id,remaining.get(task.id)!-work);workBudget-=work;lastCategory=task.category;a=b
      if(personal(task))(task.minutes<=15?tinyTasks:coreTasks).add(task.id)
      if(work>=120 && (remaining.get(task.id)||0)>0){const restEnd=Math.min(limit,a+rest*minute);add('Free time',a,restEnd,'break');a=restEnd}continue}
    }
    // Unallocated time is deliberate recovery/leisure, never invented obligations.
    const b=limit
    add('Free time',a,b,'break');a=b
   }
  }
  for(const routine of routines){
   const from=Math.max(routine.start,wake,now.getTime()),to=Math.min(routine.end,sleep)
   if(to<=from)continue
   const allocated=planned.filter(event=>event.title===routine.title&&event.planning?.kind==='routine').reduce((sum,event)=>sum+Math.max(0,Math.min(to,new Date(event.end).getTime())-Math.max(from,new Date(event.start).getTime())),0)
   if(allocated<to-from-1000)warnings.push(key+': '+routine.title+' conflicts with another fixed activity; confirm a suitable time instead of skipping it.')
  }
 }
 for(const task of profile.tasks){if(task.status==='todo'&&(remaining.get(task.id)||0)>0)warnings.push(task.title+': '+remaining.get(task.id)+' minutes not allocated'+(task.deadline?' before its deadline':''))}
 return {events:normalizeEventFolders([...retained,...planned]),added:planned.length,warnings,from:date,through:toDateInput(addDays(start,count-1))}
}
