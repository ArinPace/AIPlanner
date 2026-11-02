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

   const state=await agentRequest<{chats:{id:string;is_main:boolean}[]}>('vm')
   const main=state.chats.find(chat=>chat.is_main)
   if(!main)throw new Error('Open Agent to set up your Main Chat, then retry.')
   if(token!==getToken())throw new Error('Your account changed. Reopen Planner to sync.')
   const message=item.kind==='fillFreeTime'?`Free-time request from my iPhone widget. Reference ${item.id} (process once). ${calendar.note} I am asking you to choose useful activities and fill ONLY the remaining free-time window ending ${calendar.end}. Read the latest calendar again before writing; if I am now busy or this window has expired, do not schedule into it. Preserve all existing fixed commitments and planned non-free activities. Replace only explicitly named Free time blocks within this window, or use its unscheduled gaps. Prioritize upcoming academic deadlines and existing urgent unfinished tasks, respect intensity and the usual one-core-non-deadline-task guidance, avoid fragmentation, and use folders where useful. This request authorizes planning into this free slot, not completing tasks or sending messages. Prepare/read a calendar stage and pass widgetFeedback=${JSON.stringify(item)} to planner_calendar_stage_edit. Make all schedule adjustments in that draft, review the full affected schedule, and use planner_calendar_stage_publish once when ready. Do not write live events incrementally. Schedule appropriate work in the draft when planning is enabled; ask a focused question if important context is missing. Report what you scheduled. Do not fill later slots or change my daily intensity.`:`Task feedback from my iPhone widget. Reference ${item.id} (process this reference only once). Reported at ${new Date(item.reportedAt*1000).toISOString()}. Calendar occurrence ID: ${item.task.id}. Linked planning task ID: ${item.task.planningTaskId||'none; identify by occurrence before editing'}. Title: ${JSON.stringify(item.task.title)}. Scheduled start: ${new Date(item.task.start*1000).toISOString()}; end: ${new Date(item.task.end*1000).toISOString()}. ${item.done?'I finished this activity early. Check off its linked checklist item in place; do not delete the item. Record completion for this occurrence only, not the recurring series.':`I now need ${item.remainingMinutes} minutes remaining from the reported time. This is a duration correction, not a completion report, even if zero.`} Widget preview only: ${JSON.stringify(calendar)}. Do NOT change live events incrementally. Use planner_calendar_stage_prepare/read, then planner_calendar_stage_edit with widgetFeedback=${JSON.stringify(item)} to apply this occurrence change only to the draft. Keep the same task and folder membership; never create a duplicate. Review and adjust the ENTIRE affected schedule in that draft: task duration, downstream timing, fixed commitments, travel/preparation, recovery, deadlines, recurrence exceptions and folder bounds. Eliminate conflicting or duplicated blocks and preserve unfinished work. Do not use live planner_save_event, planner_delete_events, planner_replan, or calendar-mutating completion tools while preparing it. Only when the complete revised plan is coherent, read back the whole draft, resolve its issues, and call planner_calendar_stage_publish ONCE to swap the live Planner calendar atomically. If draft preparation/review is blocked, leave the live calendar untouched and report why. Check the resulting revision and read back the final schedule. After publishing, record task learning/completion with replan:false, keeping checked checklist items in place; do not trigger a second calendar rewrite. Do not infer completion from elapsed time.`
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
 return <div role="status" style={{padding:'10px 16px',background:'#eef5ff',color:'#182c4b'}}>{status} {pending&&!busy&&<><button onClick={()=>void send(pending)}>Retry</button> <button onClick={()=>void nativeRequest({action:'ackTaskFeedback',id:pending.id,account:username,discard:true}).then(()=>{setPending(null);setStatus('')})}>Dismiss</button></>}{!pending&&<button aria-label="Dismiss task feedback status" onClick={()=>setStatus('')}>×</button>}</div>
}
