import {useCallback,useEffect,useRef,useState} from 'react'
import {agentAction,agentRequest} from '../lib/agent'
import {ChatMarkdown} from './ChatMarkdown'

interface RelayJob{id:string;message:string;reply:string;status:string;error:string|null}
export function ChatExperiment(){
 const [jobs,setJobs]=useState<RelayJob[]>([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const requestId=useRef<string|null>(null),end=useRef<HTMLDivElement>(null)
 const refresh=useCallback(async()=>{const state=await agentRequest<{jobs:RelayJob[]}>('vm/chat-web');setJobs(state.jobs)},[])
 useEffect(()=>{let alive=true;const update=()=>{void refresh().catch(e=>{if(alive)setError(e.message)})};update();const timer=setInterval(update,3000);return()=>{alive=false;clearInterval(timer)}},[refresh])
 const lastReply=jobs.at(-1)?.reply
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'})},[jobs.length,lastReply])
 const running=jobs.some(job=>['queued','running'].includes(job.status))
 async function send(){
  if(!draft.trim()||busy||running)return
  setBusy(true);setError('');const message=draft.trim(),id=requestId.current||crypto.randomUUID();requestId.current=id
  try{await agentAction('vm/chat-web',{id,message});requestId.current=null;setDraft(current=>current.trim()===message?'':current);await refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not send to the experiment.')}
  finally{setBusy(false)}
 }
 return <section className="chat-experiment" aria-label="Experimental Chat">
  <header><h1>Chat <small>Subscription relay experiment</small></h1><p>Connected to a separate ChatGPT Work conversation. Main Chat, the Agent queue and scheduled task are separate.</p><p>Calendar, Files and website access are not yet verified for this conversation. The relay currently needs the test browser on your computer to stay online.</p></header>
  {error&&<p role="alert" className="assistant-error">{error}</p>}
  <div className="chat-experiment-history"><div className="assistant-thread-content">{!jobs.length&&<p>Send a message to test the separate ChatGPT conversation.</p>}{jobs.map(job=><article className="assistant-turn" key={job.id}><div className="assistant-user-message">{job.message}</div>{job.reply&&<div className="assistant-reply"><ChatMarkdown text={job.reply}/></div>}{['queued','running'].includes(job.status)&&<p role="status">{job.status==='queued'?'Waiting for browser relay…':'ChatGPT is working…'}</p>}{job.error&&<p className="assistant-error" role="alert">{job.error}</p>}</article>)}<div ref={end}/></div></div>
  <form className="chat-experiment-compose" onSubmit={e=>{e.preventDefault();void send()}}><label className="sr-only" htmlFor="chat-experiment-message">Message experimental Chat</label><textarea id="chat-experiment-message" rows={2} maxLength={12000} placeholder="Message the separate ChatGPT conversation…" value={draft} onChange={e=>{setDraft(e.target.value);requestId.current=null}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><button type="submit" className="primary-btn" disabled={busy||running||!draft.trim()}>Send</button></form>
 </section>
}
