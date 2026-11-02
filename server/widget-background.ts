import {ApiError,body,json} from './cloud.js'
import {calendarRow} from './planner-workspace.js'
import {widgetFeedbackSchema} from './calendar-staging.js'
import {handleVmRequest} from './vm.js'
import {widgetSnapshot} from '../src/lib/widgetSnapshot.js'
import {widgetFeedbackMessage} from '../src/lib/widgetFeedbackMessage.js'
import {ensureMainChat} from './vm-chats.js'
import {verifyFreeTimeRequest} from '../src/lib/widgetTaskFeedback.js'
export async function handleWidgetBackground(request:Request,path:string,username:string){
 if(path.endsWith('/snapshot')){
  if(request.method!=='GET')throw new ApiError(405,'Use GET.')
  const {state}=await calendarRow(username)
  return json(widgetSnapshot(state.events,undefined,state.tags,state.resolvedWidgetFeedbackIds||[]))
 }
 if(request.method!=='POST')throw new ApiError(405,'Use POST.')
 const item=widgetFeedbackSchema.parse(await body(request))
 const {state}=await calendarRow(username)
 if(state.resolvedWidgetFeedbackIds?.includes(item.id))return json({ok:true,merged:true})
 const calendar=item.kind==='fillFreeTime'?verifyFreeTimeRequest(state.events,state.tags,item):{applied:false,end:new Date((item.requestedEnd??item.reportedAt+item.remainingMinutes*60)*1000).toISOString(),note:'Widget preview only. Prepare a complete revised draft; do not mutate the live calendar until publication.'}
 const base=new URL(request.url).origin
 const chatId=await ensureMainChat(username)
 return handleVmRequest(new Request(base+'/api/agent/vm/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId,message:widgetFeedbackMessage(item,calendar),attachments:[],queue:true})}),'/api/agent/vm/send',username)
}
