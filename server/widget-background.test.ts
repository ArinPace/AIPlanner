import test from 'node:test'
import assert from 'node:assert/strict'
import {handleWidgetBackground} from './widget-background.js'
import {handleCloudRequest} from './cloud.js'
const chat='11111111-1111-4111-8111-111111111111'
const feedback={id:'22222222-2222-4222-8222-222222222222',task:{id:'hw@2026-11-02T13:00:00.000Z',title:'Homework',start:1793624400,end:1793628000},remainingMinutes:10,done:false,reportedAt:1793626200,requestedEnd:1793626800}
test('background feedback queues the same atomic draft instructions without calendar writes; merged IDs do not resend',async()=>{
 process.env.SUPABASE_URL='https://widget.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const original=globalThis.fetch;let merged=false,sends=0
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  if(url.pathname.endsWith('/planner_calendars')){
   assert.equal(req.method,'GET');assert.equal(url.searchParams.get('username'),'eq.owner')
   return Response.json({revision:1,state:{events:[],tags:[],resolvedWidgetFeedbackIds:merged?[feedback.id]:[]}})
  }
  if(url.pathname.endsWith('/rpc/planner_ensure_main_chat')){assert.deepEqual(await req.json(),{p_username:'owner'});return Response.json(chat)}
  if(url.pathname.endsWith('/planner_vm_chats')){
   assert.equal(url.searchParams.get('username'),'eq.owner')
   return Response.json(req.method==='GET'?{id:chat,is_main:true}:null)
  }
  if(url.pathname.endsWith('/planner_vm_hosts')){assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json({id:'host'})}
  if(url.pathname.endsWith('/rpc/planner_vm_chat_control')){
   const args=await req.json() as any;sends++
   assert.equal(args.p_username,'owner');assert.equal(args.p_action,'queue')
   assert.ok(args.p_message.includes('widgetFeedback='+JSON.stringify(feedback)))
   assert.ok(args.p_message.includes('planner_calendar_stage_publish ONCE'))
   return Response.json({id:'job'})
  }
  throw Error('Unexpected operation '+req.method+' '+url.pathname)
 }
 try{
  const post=()=>handleWidgetBackground(new Request('https://planner.test/api/widget/feedback',{method:'POST',body:JSON.stringify(feedback)}),'/api/widget/feedback','owner')
  assert.equal((await post()).status,202);assert.equal(sends,1)
  merged=true;assert.equal((await post()).status,200);assert.equal(sends,1)
  const snapshot=await handleWidgetBackground(new Request('https://planner.test/api/widget/snapshot'),'/api/widget/snapshot','owner')
  assert.deepEqual(((await snapshot.json()) as {resolvedFeedbackIds:string[]}).resolvedFeedbackIds,[feedback.id])
  assert.equal((await handleCloudRequest(new Request('https://planner.test/api/widget/feedback',{method:'POST',body:JSON.stringify(feedback)}))).status,401)
 }finally{globalThis.fetch=original}
})
