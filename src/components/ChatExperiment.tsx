import {useCallback,useEffect,useRef,useState} from 'react'
import {agentAction,agentRequest} from '../lib/agent'
import {ChatMarkdown} from './ChatMarkdown'
import {useChatDraft} from '../lib/chatDraft'

interface RelayJob{id:string;message:string;reply:string;status:string;error:string|null}
export function ChatExperiment({active=true,username}:{active?:boolean;username:string}){
 const [jobs,setJobs]=useState<RelayJob[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [installed,setInstalled]=useState(false),[connected,setConnected]=useState(false)
 const {message:draft,setMessage:setDraft,selectDraft}=useChatDraft(username)
 const end=useRef<HTMLDivElement>(null),pending=useRef(new Set<string>())
 const post=useCallback((value:object)=>window.postMessage({source:'planner-chat-tab',...value},window.location.origin),[])
 const refresh=useCallback(async()=>{
  const state=await agentRequest<{jobs:RelayJob[]}>('vm/chat-web')
  state.jobs.filter(job=>job.status==='running').forEach(job=>pending.current.add(job.id))
  setJobs(state.jobs)
 },[])
 useEffect(()=>{selectDraft('experimental-device-chat')},[selectDraft])
 const finish=useCallback(async(id:string,reply:string,error?:string)=>{
  try{
   const job=await agentAction<RelayJob>('vm/chat-web',{action:'finish',id,reply,error})
   pending.current.delete(id);setJobs(current=>current.map(row=>row.id===id?job:row))
  }catch(e){setError(e instanceof Error?e.message:'Could not save the reply. Check ChatGPT before resending.')}
 },[])
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.source!==window||event.origin!==window.location.origin||event.data?.source!=='planner-device-relay')return
   const data=event.data
   if(data.type==='ready'){setInstalled(true);setConnected(data.connected===true);return}
   if(data.type==='disconnected'){setInstalled(false);setConnected(false);setError('The extension disconnected. Check ChatGPT before resending.');return}
   if(data.type==='error'){setError(String(data.error||'Browser relay unavailable.'));if(pending.current.has(data.id))void finish(data.id,'',String(data.error));return}
   if(!pending.current.has(data.id))return
   const reply=typeof data.reply==='string'?data.reply.slice(0,80000):''
   if(data.type==='progress')setJobs(current=>current.map(job=>job.id===data.id?{...job,reply}:job))
   if(data.type==='finish')void finish(data.id,reply,typeof data.error==='string'?data.error:undefined)
  }
  window.addEventListener('message',receive)
  return()=>window.removeEventListener('message',receive)
 },[finish])
 useEffect(()=>{
  if(!active)return
  const initial=window.setTimeout(()=>{void refresh().catch(e=>setError(e.message));post({type:'hello'})},0)
  const timer=window.setInterval(()=>post({type:'status'}),15000)
  return()=>{window.clearTimeout(initial);window.clearInterval(timer)}
 },[active,refresh,post])
 const lastReply=jobs.at(-1)?.reply
 useEffect(()=>{if(active)end.current?.scrollIntoView({block:'nearest'})},[active,jobs.length,lastReply])
 const running=jobs.some(job=>['queued','running'].includes(job.status))
 async function send(){
  if(!draft.trim()||busy||running||!connected)return
  setBusy(true);setError('');const message=draft.trim(),id=crypto.randomUUID()
  try{
   const job=await agentAction<RelayJob>('vm/chat-web',{action:'begin',id,message})
   pending.current.add(id);setJobs(current=>[...current,job])
   setDraft(current=>current.trim()===message?'':current)
   post({type:'send',id,message})
  }catch(e){setError(e instanceof Error?e.message:'Could not send to the experiment.')}
  finally{setBusy(false)}
 }
 return <section className="chat-experiment" aria-label="Experimental Chat">
  <header><h1>Chat <small>VM-free device relay</small></h1><p>Main Chat, the Agent queue and scheduled task are separate. No VM is used by this tab.</p>
   <p role="status">{!installed?'Install the laptop browser extension to connect.':connected?'ChatGPT Work connected on this device.':'Sign into ChatGPT and select Work in the separate tab, then return here.'}</p>
   <div><a href="/chat-relay-extension.zip" download>Download Chrome/Edge extension</a>{' ? '}<a href="/chat-relay-setup.txt" target="_blank" rel="noopener noreferrer">Install instructions</a>{' ? '}<button type="button" className="text-btn" disabled={!installed} onClick={()=>post({type:'connect'})}>Connect ChatGPT tab</button>{' ? '}<button type="button" className="text-btn" onClick={()=>post({type:'status'})}>Check connection</button></div>
   <p>Keep Planner and the separate ChatGPT tab open. Laptop Chrome/Edge only for now. Calendar, Files and cloud-browser access are not yet verified in this conversation.</p>
  </header>
  {error&&<p role="alert" className="assistant-error">{error}</p>}
  <div className="chat-experiment-history"><div className="assistant-thread-content">{!jobs.length&&<p>Connect the extension, then send a test message.</p>}{jobs.map(job=><article className="assistant-turn" key={job.id}><div className="assistant-user-message">{job.message}</div>{job.reply&&<div className="assistant-reply"><ChatMarkdown text={job.reply}/></div>}{['queued','running'].includes(job.status)&&<p role="status">Waiting for ChatGPT on this device? <button type="button" className="text-btn" onClick={()=>{if(window.confirm('End tracking this message in Planner? This does not stop ChatGPT. Check its tab before resending.'))void finish(job.id,job.reply,'Tracking ended on this device. Check ChatGPT before resending.')}}>End tracking</button></p>}{job.error&&<p className="assistant-error" role="alert">{job.error}</p>}</article>)}<div ref={end}/></div></div>
  <form className="chat-experiment-compose" onSubmit={e=>{e.preventDefault();void send()}}><label className="sr-only" htmlFor="chat-experiment-message">Message experimental Chat</label><textarea id="chat-experiment-message" rows={2} maxLength={12000} placeholder="Message the separate ChatGPT conversation?" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><button type="submit" className="primary-btn" disabled={busy||running||!connected||!draft.trim()}>Send</button></form>
 </section>
}
