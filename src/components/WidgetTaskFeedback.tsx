import {widgetFeedbackMessage} from '../lib/widgetFeedbackMessage'
import {useEffect, useRef, useState} from 'react'
import {agentRequest} from '../lib/agent'
import {getToken,sendWidgetCompletion} from '../lib/api'
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
   if (item.done && item.kind !== 'fillFreeTime') {
    await sendWidgetCompletion(item)
    if (token !== getToken()) throw new Error('Your account changed. Reopen Planner to sync.')
    localStorage.setItem(key, 'sent')
    await nativeRequest({action: 'ackTaskFeedback', id: item.id, account: username})
    window.dispatchEvent(new Event('planner-calendar-refresh'))
    setPending(null)
    setStatus('Activity completed. Its remaining time is free time.')
    return
   }
   const calendar=await onApply(item)
   if(token!==getToken())throw new Error('Your account changed. Reopen Planner to sync.')

   const state=await agentRequest<{chats:{id:string;is_main:boolean}[]}>('vm')
   const main=state.chats.find(chat=>chat.is_main)
   if(!main)throw new Error('Open Agent to set up your Main Chat, then retry.')
   if(token!==getToken())throw new Error('Your account changed. Reopen Planner to sync.')
   const message=widgetFeedbackMessage(item,calendar)
   localStorage.setItem(key,'attempted')
   await agentRequest('vm/send',{method:'POST',body:JSON.stringify({chatId:main.id,message,attachments:[],queue:true}),signal:AbortSignal.timeout(45000)})
   localStorage.setItem(key,'sent')
   await nativeRequest({action:'ackTaskFeedback',id:item.id,account:username})
   setPending(null);setStatus(item.kind==='fillFreeTime'?'Sent to your agent to fill this free-time slot.':'Widget time updated. Your agent is preparing a draft; the calendar will update all at once when it is ready.')
  }catch(error){setStatus((error instanceof Error?error.message:'Could not send feedback.')+' Your request is saved. If delivery is uncertain, check Main Chat before retrying.')}
  finally{sending.current=false;setBusy(false)}
 }
 useEffect(()=>{
  if(!isIPhoneApp())return
  let active=true
  const token=getToken()

  async function check(){
   try{
    if(token)await nativeRequest({action:"widgetDeliverySession",account:username,token}).catch(()=>{})
    const item=await nativeRequest<TaskFeedback|null>({action:'taskFeedback',account:username})
    if(!active||!item)return
    setPending(item)
    if(!attempted.current.has(item.id)){
     attempted.current.add(item.id)
     const nativeDelivery=await nativeRequest<string|null>({action:'taskFeedbackDelivery',id:item.id,account:username}).catch(()=>null)
     const previous=(typeof nativeDelivery==='string'?nativeDelivery:null)||localStorage.getItem('planner-widget-feedback:'+username+':'+item.id)
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
 return <div role="status" style={{padding:'10px 16px',background:'#eef5ff',color:'#182c4b'}}>{status} {pending&&!busy&&<><button onClick={()=>void send(pending)}>Retry</button> <button onClick={()=>void nativeRequest({action:'ackTaskFeedback',id:pending.id,account:username,discard:true}).then(()=>{setPending(null);setStatus('')})}>Dismiss</button></>}{!pending&&<button aria-label="Dismiss task feedback status" onClick={()=>setStatus('')}>×</button>}</div>
}
