import { useState } from 'react'
import { agentAction } from '../lib/agent'

export interface AgentApprovalRequest {id:string;expires_at:string;questions:{id:string;question:string;options:string[]}[]}
export function AgentApproval({request,onAnswered}:{request:AgentApprovalRequest;onAnswered:()=>Promise<void>}) {
  const [answers,setAnswers]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  return <form className="assistant-approval" onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void agentAction('vm/approval',{id:request.id,answers}).then(onAnswered).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>
    <strong>Your decision is needed</strong><p>The agent is paused until you answer. This applies to this request only.</p>
    {request.questions.map(q=><fieldset key={q.id}><legend>{q.question}</legend>{q.options.map(option=><label key={option}><input type="radio" name={request.id+q.id} value={option} checked={answers[q.id]===option} onChange={()=>setAnswers(a=>({...a,[q.id]:option}))} disabled={busy}/>{option}</label>)}</fieldset>)}
    <button type="submit" disabled={busy || request.questions.some(q=>!answers[q.id])}>{busy?'Sending decision…':'Confirm decision'}</button>
    {error && <p role="alert">{error}</p>}
  </form>
}
