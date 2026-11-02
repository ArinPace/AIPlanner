import {useEffect, useRef, useState} from 'react'
import {agentRequest} from '../lib/agent'
import {getToken} from '../lib/api'
import {isIPhoneApp, nativeRequest} from '../lib/platform'

import type {TaskFeedback, TaskTimeResult} from '../lib/widgetTaskFeedback'
export function WidgetTaskFeedback({username,onApply}:{username:string;onApply:(item:TaskFeedback)=>Promise<TaskTimeResult>}) {
 const [pending,setPending]=useState<TaskFeedback|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
 const attempted=useRef(new Set<string>()),sending=useRef(false)
 async function send(item:TaskFeedback) {
  if(sending.current)return
  const token=getToken(),key='planner-widget-feedback:'+username+':'+item.id
  sending.current=true;setBusy(true);setStatus('Sending task feedback…')
  try {
   const calendar=await onApply(item)
   if(token!==getToken())throw new Error('Your account changed. Reopen Planner to sync.')
   if(calendar.applied)await nativeRequest({action:'taskFeedbackApplied',id:item.id,account:username}).catch(error=>{if(!/unsupported native action/i.test(String(error)))throw error})
   const state=await agentRequest<{chats:{id:string;is_main:boolean}[]}>('vm')
   const main=state.chats.find(chat=>chat.is_main)
   if(!main)throw new Error('Open Agent to set up your Main Chat, then retry.')
   if(token!==getToken())throw new Error('Your account changed. Reopen Planner to sync.')
   const message=`Task feedback from my iPhone widget. Reference ${item.id} (process this reference only once). Reported at ${new Date(item.reportedAt*1000).toISOString()}. Calendar occurrence ID: ${item.task.id}. Linked planning task ID: ${item.task.planningTaskId||'none; identify by occurrence before editing'}. Title: ${JSON.stringify(item.task.title)}. Scheduled start: ${new Date(item.task.start*1000).toISOString()}; end: ${new Date(item.task.end*1000).toISOString()}. ${item.done?'I finished this activity early. Check off its linked checklist item in place; do not delete the item. Record completion for this occurrence only, not the recurring series.':`I now need ${item.remainingMinutes} minutes remaining from the reported time. This is a duration correction, not a completion report, even if zero.`} Immediate calendar update: ${JSON.stringify(calendar)}. Please read the current calendar and adjust the remaining schedule appropriately, preserving fixed commitments and unfinished tasks. Respect recurring occurrence scope. Do not treat elapsed time as completion. Tell me what changed or any conflicts.`
   localStorage.setItem(key,'attempted')
   await agentRequest('vm/send',{method:'POST',body:JSON.stringify({chatId:main.id,message,attachments:[],queue:true}),signal:AbortSignal.timeout(45000)})
   localStorage.setItem(key,'sent')
   await nativeRequest({action:'ackTaskFeedback',id:item.id,account:username})
   setPending(null);setStatus(calendar.applied?'Task time saved. Sent to your agent to reorganize the rest of your schedule.':'Sent to your agent to resolve the calendar change safely.')
  }catch(error){setStatus((error instanceof Error?error.message:'Could not send feedback.')+' Your request is saved. If delivery is uncertain, check Main Chat before retrying.')}
  finally{sending.current=false;setBusy(false)}
 }
 useEffect(()=>{
  if(!isIPhoneApp())return
  let active=true
  async function check(){
   try{
    const item=await nativeRequest<TaskFeedback|null>({action:'taskFeedback',account:username})
    if(!active||!item)return
    setPending(item)
    if(!attempted.current.has(item.id)){
     attempted.current.add(item.id)
     const previous=localStorage.getItem('planner-widget-feedback:'+username+':'+item.id)
     if(previous==='sent'){await nativeRequest({action:'ackTaskFeedback',id:item.id,account:username});setPending(null);setStatus('Sent to your agent. Schedule changes will appear after it processes your request.')}
     else if(previous)setStatus('This request may already have been sent. Check Main Chat before retrying.')
     else void send(item)
    }
   }catch{/* Older app versions do not support task feedback. */}
  }
  const timer=window.setInterval(()=>void check(),2000)
  const focus=()=>void check();window.addEventListener('focus',focus)
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}
 // Each account owns its native feedback queue; send reads no component state.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[username,onApply])
 if(!status)return null
 return <div role="status" style={{padding:'10px 16px',background:'#eef5ff',color:'#182c4b'}}>{status} {pending&&!busy&&<><button onClick={()=>void send(pending)}>Retry</button> <button onClick={()=>void nativeRequest({action:'ackTaskFeedback',id:pending.id,account:username}).then(()=>{setPending(null);setStatus('')})}>Dismiss</button></>}{!pending&&<button aria-label="Dismiss task feedback status" onClick={()=>setStatus('')}>×</button>}</div>
}
