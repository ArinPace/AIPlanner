import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDayPlan} from './day-planner.js'
import {DEFAULT_PLANNING,intensityFor,type PlanningTask} from '../src/lib/planning.js'
import {PlannerDate as Date} from '../src/lib/timezone.js'
import type {CalendarEvent} from '../src/types.js'
const task=(id:string,urgency:number,minutes=60):PlanningTask=>({id,title:id,urgency,minutes,category:'study',deadline:null,preferredDays:[],earliestDate:null,status:'todo',source:'test',goal:''})
const profile=()=>({...structuredClone(DEFAULT_PLANNING),enabled:true,onboarded:true,intensity:80,wake:'07:00',sleep:'23:00',readyMinutes:30,windDownMinutes:30,meals:[{title:'Lunch',time:'13:00',minutes:30}]})
const now=new Date('2026-10-19T00:00:00-04:00')
test('routines are learned rather than universal presets; a lunch-only user gets no extra meals',()=>{
 assert.equal(DEFAULT_PLANNING.wake,'');assert.equal(DEFAULT_PLANNING.sleep,'')
 assert.deepEqual(DEFAULT_PLANNING.meals,[])
 assert.equal(DEFAULT_PLANNING.readyMinutes,0);assert.equal(DEFAULT_PLANNING.windDownMinutes,0)
 assert.throws(()=>buildDayPlan(structuredClone(DEFAULT_PLANNING),[],'2026-10-19',1,now),/Confirm this user's wake\/sleep/)
 const p=profile();p.readyMinutes=0;p.windDownMinutes=0
 const result=buildDayPlan(p,[],'2026-10-19',1,now)
 assert.ok(result.events.some(event=>event.title==='Lunch'))
 for(const title of ['Breakfast','Dinner','Get ready for the day','Wind down / get ready for bed'])assert.equal(result.events.some(event=>event.title===title),false)
})
function fixed(id:string,start:string,end:string):CalendarEvent{return {id,title:id,start,end,allDay:false,description:'',tagIds:[],recurrence:{frequency:'none',interval:1,until:null}}}
test('fixed commitments survive; deadlines precede urgency; plans do not overlap',()=>{
 const p=profile();p.tasks=[task('urgent',99),{...task('deadline',10),deadline:'2026-10-19T12:00:00-04:00'}]
 const appointment=fixed('class','2026-10-19T09:00:00-04:00','2026-10-19T10:00:00-04:00')
 const result=buildDayPlan(p,[appointment],'2026-10-19',1,now)
 assert.deepEqual(result.events.find(e=>e.id==='class'),appointment)
 assert.equal(result.events.filter(e=>e.planning?.kind==='task')[0].planning?.taskId,'deadline')
 const sorted=[...result.events].sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime())
 for(let i=1;i<sorted.length;i++)assert.ok(new Date(sorted[i].start)>=new Date(sorted[i-1].end),'No overlaps')
 for(let i=1;i<sorted.length;i++)assert.equal(new Date(sorted[i].start).getTime(),new Date(sorted[i-1].end).getTime(),'Every minute, including transition buffers, is accounted for')
 assert.ok(result.events.some(e=>e.planning?.kind==='break'&&e.title!=='Break'))
 assert.ok(result.events.some(e=>e.planning?.kind==='sleep'))
})
test('weekday/date intensity reduces actual workload without a recovery cap',()=>{
 const p=profile();p.tasks=[task('work',90,2000)]
 const minutes=(intensity:number)=>buildDayPlan({...p,intensity},[],'2026-10-19',1,now).events.filter(e=>e.planning?.kind==='task').reduce((n,e)=>n+(new Date(e.end).getTime()-new Date(e.start).getTime())/60000,0)
 assert.ok(minutes(20)<minutes(80));assert.equal(minutes(0),0)
 p.weekdays[1]=75;p.overrides['2026-10-19']=40
 assert.equal(intensityFor(p,'2026-10-19',1),40)
 assert.equal(intensityFor({...p,recoveryUntil:'2026-10-24'} as typeof p,'2026-10-19',1),40) // Legacy recovery state has no effect.
 p.overrides['2026-10-19']=65;assert.equal(intensityFor(p,'2026-10-19',1),65)
})
test('preferred days, impossible deadlines, learned estimates, idempotent replans',()=>{
 const p=profile();p.tasks=[{...task('laundry',5),preferredDays:[2]},task('study',80,30),{...task('too late',90),deadline:'2026-10-19T06:00:00-04:00'}];p.learning.study={samples:3,ratio:2}
 const result=buildDayPlan(p,[],'2026-10-19',1,now)
 assert.equal(result.events.some(e=>e.planning?.taskId==='laundry'),false)
 assert.ok(result.warnings.some(w=>w.startsWith('too late:')))
 const study=result.events.filter(e=>e.planning?.taskId==='study')
 assert.equal(study.reduce((n,e)=>n+(new Date(e.end).getTime()-new Date(e.start).getTime())/60000,0),60)
 const again=buildDayPlan(p,result.events,'2026-10-19',1,now)
 assert.equal(again.events.length,result.events.length)
})
test('replanning preserves past and locked blocks across DST boundaries',()=>{
 const p=profile();const locked={...fixed('locked','2026-11-01T12:00:00-05:00','2026-11-01T13:00:00-05:00'),planning:{kind:'task' as const,locked:true}}
 const result=buildDayPlan(p,[locked],'2026-11-01',1,new Date('2026-11-01T00:00:00-04:00'))
 assert.deepEqual(result.events.find(e=>e.id==='locked'),locked)
 assert.ok(result.events.every(e=>Number.isFinite(new Date(e.end).getTime())))
})
test('custom meals and agent-selected rest activities are respected',()=>{
 const p=profile();p.meals=[{title:'Late breakfast',time:'09:30',minutes:45}];p.breakActivities=['Listen to music']
 const result=buildDayPlan(p,[],'2026-10-19',1,now)
 const meal=result.events.find(e=>e.title==='Late breakfast')!
 assert.equal(new Date(meal.start).getHours(),9);assert.equal(new Date(meal.start).getMinutes(),30)
 assert.equal((new Date(meal.end).getTime()-new Date(meal.start).getTime())/60000,45)
 assert.equal(result.events.some(e=>e.title==='Breakfast'||e.title==='Take a short walk'),false)
})
test('getting ready, wind down and sleep are daily anchors independent of intensity',()=>{
 const p=profile();p.tasks=[task('Flexible work',99,900)]
 const anchors=(intensity:number)=>buildDayPlan({...p,intensity},[],'2026-10-19',2,now).events.filter(e=>e.planning?.kind==='sleep'||e.title==='Get ready for the day'||e.title==='Wind down / get ready for bed').map(e=>({title:e.title,start:e.start,end:e.end}))
 assert.deepEqual(anchors(20),anchors(90))
 assert.equal(anchors(20).filter(e=>e.title==='Get ready for the day').length,2)
 assert.equal(anchors(20).filter(e=>e.title==='Wind down / get ready for bed').length,2)
 const blocked=fixed('Early appointment','2026-10-19T07:00:00-04:00','2026-10-19T08:00:00-04:00')
 assert.ok(buildDayPlan(p,[blocked],'2026-10-19',1,now).warnings.some(w=>w.includes('Get ready for the day conflicts')))
})

test('incomplete onboarding can produce a continuous provisional day with known planning windows',()=>{
 const p=profile();p.onboarded=false;p.tasks=[task('provisional work',60,45)]
 const result=buildDayPlan(p,[],'2026-10-19',1,now)
 const events=[...result.events].sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime())
 assert.equal(events[0].start,now.toISOString())
 assert.equal(events.at(-1)?.end,new Date('2026-10-20T00:00:00-04:00').toISOString())
 for(let i=1;i<events.length;i++)assert.equal(events[i].start,events[i-1].end)
 assert.ok(events.some(event=>event.planning?.taskId==='provisional work'))
})
