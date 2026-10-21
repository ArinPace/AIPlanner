import {useCallback,useEffect,useRef,useState} from 'react'
import {agentAction,agentRequest} from '../lib/agent'
import {ChatMarkdown} from './ChatMarkdown'
import {useChatDraft} from '../lib/chatDraft'

interface RelayJob{id:string;message:string;reply:string;status:string;error:string|null}
export function ChatExperiment({active=true,username}:{active?:boolean;username:string}){
 const [jobs,setJobs]=useState<RelayJob[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [installed,setInstalled]=useState(false),[connected,setConnected]=useState(false)
 const [checking,setChecking]=useState(false),[connectionNotice,setConnectionNotice]=useState('')
 const checkTimer=useRef<number|null>(null)
 const {message:draft,setMessage:setDraft,selectDraft}=useChatDraft(username)
 const end=useRef<HTMLDivElement>(null),pending=useRef(new Set<string>())
 const post=useCallback((value:object)=>window.postMessage({source:'planner-chat-tab',...value},window.location.origin),[])
 const checkConnection=useCallback((type:'status'|'connect'='status')=>{
  if(checkTimer.current)window.clearTimeout(checkTimer.current)
  setChecking(true);setConnectionNotice(type==='connect'?'Opening the separate ChatGPT tab…':'Checking the browser extension…')
  post({type})
  checkTimer.current=window.setTimeout(()=>{
   setChecking(false);setInstalled(false);setConnected(false)
   setConnectionNotice('No response from the extension. Reload this Planner tab after installing it. If it still does not respond, check that the extension is enabled and allowed on aiplanner-ten.vercel.app in your browser’s Extensions settings.')
  },4000)
 },[post])
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
   if(data.type==='ready'){
    if(checkTimer.current)window.clearTimeout(checkTimer.current)
    setChecking(false);setInstalled(true);setConnected(data.connected===true)
    setConnectionNotice(data.connected?'ChatGPT Work connected on this device.':typeof data.reason==='string'?data.reason:'Extension detected. Click Connect ChatGPT tab to open the separate tab, sign in and select Work, then return here and check again.')
    return
   }
   if(data.type==='disconnected'){if(checkTimer.current)window.clearTimeout(checkTimer.current);setChecking(false);setInstalled(false);setConnected(false);setConnectionNotice('The extension disconnected. Reload this Planner tab. Check ChatGPT before resending any message.');return}
   if(data.type==='error'){if(checkTimer.current)window.clearTimeout(checkTimer.current);setChecking(false);setError(String(data.error||'Browser relay unavailable.'));if(pending.current.has(data.id))void finish(data.id,'',String(data.error));return}
   if(!pending.current.has(data.id))return
   const reply=typeof data.reply==='string'?data.reply.slice(0,80000):''
   if(data.type==='progress')setJobs(current=>current.map(job=>job.id===data.id?{...job,reply}:job))
   if(data.type==='finish')void finish(data.id,reply,typeof data.error==='string'?data.error:undefined)
  }
  window.addEventListener('message',receive)
  return()=>{window.removeEventListener('message',receive);if(checkTimer.current)window.clearTimeout(checkTimer.current)}
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
   <p role="status" aria-live="polite">{connectionNotice||(!installed?'Install the laptop browser extension, then reload this Planner tab.':connected?'ChatGPT Work connected on this device.':'Sign into ChatGPT and select Work in the separate tab, then return here.')}</p>
   <div><a href="/chat-relay-extension.zip" download>Download Chrome/Edge extension</a>{' · '}<a href="/chat-relay-setup.txt" target="_blank" rel="noopener noreferrer">Install instructions</a>{' · '}<button type="button" className="text-btn" disabled={checking} onClick={()=>checkConnection('connect')}>Connect ChatGPT tab</button>{' · '}<button type="button" className="text-btn" disabled={checking} onClick={()=>checkConnection()}>{checking?'Checking…':'Check connection'}</button></div>
   <p>Keep Planner and the separate ChatGPT tab open. Laptop Chrome/Edge only for now. Calendar, Files and cloud-browser access are not yet verified in this conversation.</p>
  </header>
  {error&&<p role="alert" className="assistant-error">{error}</p>}
  <div className="chat-experiment-history"><div className="assistant-thread-content">{!jobs.length&&<p>Connect the extension, then send a test message.</p>}{jobs.map(job=><article className="assistant-turn" key={job.id}><div className="assistant-user-message">{job.message}</div>{job.reply&&<div className="assistant-reply"><ChatMarkdown text={job.reply}/></div>}{['queued','running'].includes(job.status)&&<p role="status">Waiting for ChatGPT on this device? <button type="button" className="text-btn" onClick={()=>{if(window.confirm('End tracking this message in Planner? This does not stop ChatGPT. Check its tab before resending.'))void finish(job.id,job.reply,'Tracking ended on this device. Check ChatGPT before resending.')}}>End tracking</button></p>}{job.error&&<p className="assistant-error" role="alert">{job.error}</p>}</article>)}<div ref={end}/></div></div>
  <form className="chat-experiment-compose" onSubmit={e=>{e.preventDefault();void send()}}><label className="sr-only" htmlFor="chat-experiment-message">Message experimental Chat</label><textarea id="chat-experiment-message" rows={2} maxLength={12000} placeholder="Message the separate ChatGPT conversation?" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><button type="submit" className="primary-btn" disabled={busy||running||!connected||!draft.trim()}>Send</button></form>
 </section>
}
