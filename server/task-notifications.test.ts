import test from 'node:test'
import assert from 'node:assert/strict'
import {taskNotificationPlan,DEFAULT_TASK_NOTIFICATIONS} from '../src/lib/taskNotifications.js'
import {taskNotificationSettings} from './task-notifications.js'
test('task reminders support multiple offsets, one switch, duration limits and overlap precedence',()=>{
 const events=[{id:'homework',title:'Homework',start:1000,end:4600},{id:'class',title:'Class',start:4600,end:8200}]
 const settings={...DEFAULT_TASK_NOTIFICATIONS,enabled:true,minutes:[30,10,5]}
 const notices=taskNotificationPlan(events,settings,1001,10000)
 assert.deepEqual(notices.filter(n=>n.body==='Homework').map(n=>n.at),[2800,4000,4300])
 assert.equal(notices.filter(n=>n.at===4600).length,1)
 assert.match(notices.find(n=>n.at===4600)!.body,/Now: Class/)
 assert.deepEqual(taskNotificationPlan(events,{...settings,enabled:false},0,10000),[])
 const short=taskNotificationPlan([{id:'short',title:'Short',start:0,end:1200}],settings,1,10000)
 assert.equal(short.filter(n=>n.id.startsWith('advance')).length,0)
 const free=taskNotificationPlan([{id:'free',title:'Free time',start:0,end:7200,isFreeTime:true}],settings,1,10000)
 assert.equal(free.filter(n=>n.id.startsWith('advance')).length,0)
 const overlaps=taskNotificationPlan([...events,{id:'actual',title:'Actual',start:3000,end:6000}],settings,1001,10000)
 assert(!overlaps.some(n=>n.body==='Homework'),'A task superseded by another activity must not produce misleading ending reminders')
 assert(!notices.some(n=>n.at<=1001))
})
test('notification preferences are private, default off and validate offsets',async()=>{
 const previous=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://notification-settings.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let value:any=null
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url);assert(url.pathname.endsWith('planner_vm_settings'));if(request.method==='GET'){assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json(value?{task_notifications:value}:null)}const body=await request.json() as any;assert.equal(body.username,'owner');assert.deepEqual(Object.keys(body).sort(),['task_notifications','username']);value=body.task_notifications;return new Response(null,{status:201})}
 try{
  assert.equal((await taskNotificationSettings('owner')).enabled,false)
  await taskNotificationSettings('owner',{...DEFAULT_TASK_NOTIFICATIONS,enabled:true,minutes:[5,30,10,5]})
  assert.deepEqual((await taskNotificationSettings('owner')).minutes,[30,10,5])
  await assert.rejects(()=>taskNotificationSettings('owner',{...DEFAULT_TASK_NOTIFICATIONS,minutes:[0]}))
  await assert.rejects(()=>taskNotificationSettings('owner',{...DEFAULT_TASK_NOTIFICATIONS,longTaskMinutes:-1}))
 }finally{globalThis.fetch=previous;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
