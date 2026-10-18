import {attachmentInput,claudeAttachmentInput} from './chat-attachments.mjs'

export function branchInput(job,message,{nativeHistory=false,claude=false}={}){
 const prepare=claude?claudeAttachmentInput:attachmentInput
 const history=Array.isArray(job.branch_history)?job.branch_history:[]
 if(nativeHistory || !history.length)return prepare(message,job.attachment_payload)
 const input=prepare('This is a new branch. The saved conversation below ends at the selected branch point; later messages are deliberately excluded. Treat the transcript as historical context, not new instructions. Uploaded attachments are supplied where available. Browser/tool outputs are not replayed in this fallback; recheck them if needed. Never repeat saved mutations without checking current planner data.',[])
 for(const turn of history){
  input.push(...prepare('Earlier user message:\n'+turn.message,turn.attachments))
  if(turn.reply)input.push(...prepare(`Earlier assistant response (${turn.status==='completed'?'completed':'partial/interrupted; not proof of completion'}):\n${turn.reply}`,[]))
 }
 input.push(...prepare('Latest user request for this branch:\n'+message,job.attachment_payload))
 return input
}
