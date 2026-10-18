import {EditChatMessage} from './EditChatMessage'
import {AgentRunControls} from './AgentRunControls'
import { PlannerDate as Date } from '../lib/timezone.js'
import {AttachButton,ChatAttachments} from './ChatAttachments'
import {ATTACHMENT_LIMIT,type ChatAttachment} from '../lib/chatAttachments'
import { DictationButton } from './DictationButton'
import { AgentApproval } from './AgentApproval'
import { useCallback, useEffect, useRef, useState } from 'react'
import { agentAction, agentRequest } from '../lib/agent'
import { VM_SOURCES, type VmChat, type VmJob, type VmState } from '../lib/vm'
import { AgentSettings } from './AgentSettings'
import { CloseIcon, MenuIcon, PlusIcon, SettingsIcon } from './Icons'
import { RenameDialog } from './RenameDialog'
import { binDaysLeft } from '../lib/bin'
import {vmJobStatus} from '../lib/vmJobStatus'

function MessageTime({value,label}:{value:string|null|undefined;label:string}) {
  if(!value || !Number.isFinite(Date.parse(value)))return null
  const date=new Date(value)
  return <time className="assistant-message-time" dateTime={value} title={date.toLocaleString(undefined,{timeZoneName:'short'})} aria-label={label+': '+date.toLocaleString()}>{date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time>
}
const pending = (job: VmJob) => ['queued', 'running','waiting'].includes(job.status)
export function AgentView({ active, sidebar, setSidebar }: { active: boolean; sidebar:boolean; setSidebar:(open:boolean)=>void }) {
  const [state, setState] = useState<VmState | null>(null)
  const [editingJob,setEditingJob]=useState<VmJob|null>(null)
  const [branching,setBranching]=useState(false)
  const [chat, setChat] = useState<string | null>(null)
  const selectedChat = useRef<string | null>(null)
  const [jobs, setJobs] = useState<VmJob[]>([])
  const [message, setMessage] = useState('')
  const [dictating,setDictating]=useState(false)
  const [attachments,setAttachments]=useState<ChatAttachment[]>([])
  const [preparingAttachments,setPreparingAttachments]=useState(false)
  const attachmentEpoch=useRef(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [now, setNow] = useState(0)
  const [panel, setPanel] = useState<'setup' | 'connections' | 'settings' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [showBin,setShowBin]=useState(false)
  const [renameChat,setRenameChat]=useState<VmChat|null>(null)
  const [copied, setCopied] = useState('')
  const [chatAction, setChatAction] = useState<string | null>(null)
  const [selecting,setSelecting]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [dismissedConnections,setDismissedConnections]=useState<string[]>([])
  const end = useRef<HTMLDivElement>(null)
  const host = state?.hosts[0]
  const claude = state?.settings.ai_provider === 'claude_code'
  const aiReady = Boolean(state?.settings.ai_provider === 'openai_api' || (host?.capabilities.signedIn && (claude ? host.capabilities.runtime === 'claude' : host.capabilities.runtime !== 'claude')))
  const provider = claude ? 'Claude' : state?.settings.ai_provider === 'openai_api' ? 'OpenAI API' : 'ChatGPT'
  const power = state?.power || (host?.online ? 'online' : 'offline')
  const powerLabel = { online: 'Online', offline: 'Offline', starting: 'Starting', preparing: 'Preparing' }[power]
  const title = state?.chats.find(c => c.id === chat)?.title || 'New chat'
  const archived = state?.chats.find(c=>c.id===chat)?.archived || false
  const visibleChats = showBin ? state?.deletedChats || [] : state?.chats.filter(c=>Boolean(c.archived)===showArchived) || []
  const confirmedConnection=state?.runs.find(r=>r.result.connected && r.result.source && !dismissedConnections.includes(r.id) && now-Date.parse(r.result.connectedAt || '')<300000)
  const closePanel = useCallback(() => setPanel(null), [])
  const refresh = useCallback(async () => {
    const next = await agentRequest<VmState>('vm'); setState(next); setNow(Date.now())
    const id = selectedChat.current
    if (id) {
      const result = await agentRequest<{ jobs: VmJob[] }>('vm/messages?chat=' + encodeURIComponent(id))
      if (selectedChat.current === id) setJobs(result.jobs)
    }
  }, [])
  useEffect(() => {
    if (!active) return
    selectedChat.current=null
    const initial = window.setTimeout(() => {
      attachmentEpoch.current++;setAttachments([]);setChat(null);setJobs([]);setMessage('');setError('');setLoadingChat(false);setPanel(null);setShowArchived(false);setShowBin(false);setSelecting(false);setSelectedIds([])
      void refresh().catch(e => setError(e.message))
    }, 0)
    const timer = window.setInterval(() => void refresh().catch(e => setError(e.message)), 4000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [active, refresh])
  useEffect(()=>{
    if(!active)return
    const resume=()=>{if(document.visibilityState==='visible')void refresh().catch(e=>setError(e.message))}
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume)
    return()=>{window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume)}
  },[active,refresh])
  const activeTask=state?.queue?.active || state?.runs.find(run=>run.status==='running')
  const lastReply = jobs.at(-1)?.reply
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [chat, jobs.length, lastReply])
  async function chooseChat(id: string) {
    attachmentEpoch.current++;setAttachments([]);selectedChat.current = id; setChat(id); setJobs([]); setMessage(''); setError(''); setLoadingChat(true)
    if (window.innerWidth <= 700) setSidebar(false)
    try { const result = await agentRequest<{ jobs: VmJob[] }>('vm/messages?chat=' + encodeURIComponent(id)); if (selectedChat.current === id) setJobs(result.jobs) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open this chat.') }
    finally { if (selectedChat.current === id) setLoadingChat(false) }
  }
  function newChat() {
    setShowArchived(false);setShowBin(false)
    setSelecting(false);setSelectedIds([])
    attachmentEpoch.current++;setAttachments([]);selectedChat.current = null; setChat(null); setJobs([]); setMessage(''); setError(''); setLoadingChat(false)
    if (window.innerWidth <= 700) setSidebar(false)
  }
  async function manageSelected(action:'archive'|'restore'|'delete'|'untrash'|'purge') {
    if(chatAction || !selectedIds.length)return
    const ids=selectedIds.filter(id=>visibleChats.some(c=>c.id===id))
    if(!ids.length)return
    if(action==='delete' && !window.confirm(`Move ${ids.length} selected chat(s) to the Bin? You can restore them for 30 days.`))return
    if(action==='purge' && !window.confirm(`Permanently delete ${ids.length} selected chat(s) and their messages? This cannot be undone.`))return
    setChatAction('bulk');setError('')
    try {
      const result=await agentAction<{ids:string[]}>('vm/chats/bulk',{ids,action})
      if(selectedChat.current && result.ids.includes(selectedChat.current)) {selectedChat.current=null;setChat(null);setJobs([]);setMessage('');setLoadingChat(false)}
      setSelectedIds([]);setSelecting(false)
      await refresh()
    }catch(e){setError(e instanceof Error?e.message:'Could not update selected chats.')}
    finally{setChatAction(null)}
  }
  async function manageChat(item: VmChat, action: 'archive' | 'delete') {
    if (chatAction) return
    if (action === 'delete' && !window.confirm(`Move “${item.title}” to the Bin? You can restore it for 30 days.`)) return
    setChatAction(item.id); setError('')
    try {
      await agentAction('vm/chats/'+action,{ id:item.id, ...(action==='archive'?{archived:!item.archived}:{}) })
      if (selectedChat.current === item.id) { selectedChat.current=null;setChat(null);setJobs([]);setMessage('');setLoadingChat(false) }
      await refresh()
    } catch(e) { setError(e instanceof Error?e.message:'Could not update this chat.') }
    finally { setChatAction(null) }
  }
  async function copyMessage(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key) }
    catch { setError('Could not copy. Check clipboard permission in your browser.') }
  }
  async function addAttachments(files:File[]){
    if(!files.length || preparingAttachments)return
    if(attachments.length+files.length>4){setError('Attach up to four files.');return}
    const epoch=attachmentEpoch.current;setPreparingAttachments(true);setError('')
    try{
      const {prepareAttachment}=await import('../lib/prepareAttachments')
      const next=[...attachments,...await Promise.all(files.map(prepareAttachment))]
      const bytes=next.reduce((sum,a)=>sum+a.size+(a.images||[]).reduce((n,image)=>n+atob(image.slice(image.indexOf(',')+1)).length,0),0)
      if(bytes>ATTACHMENT_LIMIT)throw Error('Attachments and PDF previews must total no more than 2 MB. Try fewer or smaller files.')
      if(epoch===attachmentEpoch.current)setAttachments(next)
    }catch(e){if(epoch===attachmentEpoch.current)setError(e instanceof Error?e.message:'Could not prepare attachments.')}
    finally{setPreparingAttachments(false)}
  }
  async function branch(job:VmJob,edited?:string){
    if(branching)return
    setBranching(true);setError('')
    try{
      const created=await agentAction<VmChat>('vm/chats/branch',{jobId:job.id,...(edited===undefined?{}:{message:edited})})
      setShowArchived(false);setShowBin(false);setSelecting(false);setSelectedIds([])
      await refresh();await chooseChat(created.id);setEditingJob(null)
    }finally{setBranching(false)}
  }
  async function send(queue=false) {
    if (preparingAttachments || dictating || busy || loadingChat || archived || (!message.trim() && !attachments.length) || !aiReady || !host) return
    const submittedMessage=message,submittedIds=new Set(attachments.map(a=>a.id)),epoch=attachmentEpoch.current
    setBusy(true); setError('')
    try {
      let id = selectedChat.current
      let untitled = !id || state?.chats.find(c => c.id === id)?.title === 'New conversation'
      if (!id) { const created = await agentAction<VmChat>('vm/chats', { title: (message || attachments[0]?.name || 'New conversation').slice(0,80) }); id = created.id; selectedChat.current = id; setChat(id); untitled = false }
      await agentAction('vm/send', { chatId: id, message, attachments, queue, ...(untitled ? { title: (message || attachments[0]?.name || 'New conversation').slice(0,80) } : {}) })
      if(epoch===attachmentEpoch.current && selectedChat.current===id){setMessage(current=>current===submittedMessage?'':current);setAttachments(current=>current.filter(a=>!submittedIds.has(a.id)))}
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send your message.') }
    finally { setBusy(false) }
  }
  return <main className={'assistant-app' + (sidebar ? ' sidebar-open' : '')}>
    {sidebar && <aside className="assistant-sidebar" aria-label="Chat sidebar">
      <div className="assistant-sidebar-top"><strong>Your chats</strong><button type="button" className="icon-btn" aria-label="Hide chat sidebar" onClick={() => setSidebar(false)}><CloseIcon size={18}/></button></div>
      <button type="button" className="assistant-new-chat" onClick={newChat}><PlusIcon size={18}/>New chat</button>
      <button type="button" className="assistant-archive-toggle" disabled={Boolean(chatAction)} aria-pressed={showArchived} onClick={()=>{setShowBin(false);setShowArchived(v=>!v);setSelectedIds([]);setSelecting(false)}}>{showArchived?'Back to chats':'Archived chats'}</button>
      <button type="button" className="assistant-archive-toggle" aria-pressed={showBin} disabled={Boolean(chatAction)} onClick={()=>{setShowBin(v=>!v);setSelectedIds([]);setSelecting(false)}}>{showBin?'Back from Bin':'Bin'}{!showBin && Boolean(state?.deletedChats?.length) && ' ('+state!.deletedChats!.length+')'}</button>
      {showBin && <p className="assistant-bin-note">Deleted chats stay here for 30 days. Restoring keeps their messages and archive status.</p>}
      <button type="button" className="assistant-archive-toggle" disabled={Boolean(chatAction) || !visibleChats.length} aria-pressed={selecting} onClick={()=>{setSelecting(v=>!v);setSelectedIds([])}}>{selecting?'Cancel selection':'Select chats'}</button>
      {selecting && <div className="assistant-bulk-actions" aria-label="Selected chat actions">
        <label><input type="checkbox" aria-label="Select all visible chats" disabled={Boolean(chatAction)} checked={visibleChats.length>0 && visibleChats.slice(0,100).every(c=>selectedIds.includes(c.id))} onChange={e=>setSelectedIds(e.target.checked?visibleChats.slice(0,100).map(c=>c.id):[])}/>Select all ({visibleChats.length})</label>
        <span role="status">{selectedIds.length} selected</span>
        <div><button type="button" disabled={!selectedIds.length || Boolean(chatAction)} onClick={()=>void manageSelected(showBin?'untrash':showArchived?'restore':'archive')}>{showBin || showArchived?'Restore selected':'Archive selected'}</button><button type="button" className="assistant-bulk-delete" disabled={!selectedIds.length || Boolean(chatAction)} onClick={()=>void manageSelected(showBin?'purge':'delete')}>{showBin?'Delete permanently':'Delete selected'}</button></div>
        {chatAction==='bulk' && <span role="status">Updating chats…</span>}
      </div>}
      <nav aria-label="Conversations" className="assistant-conversations">{visibleChats.map(item => <div className={'assistant-chat-row'+(selecting?' is-selecting':'')} key={item.id}>{selecting && <input type="checkbox" aria-label={'Select '+item.title} disabled={Boolean(chatAction)} checked={selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>}<button type="button" title={item.title} aria-current={item.id === chat ? 'page' : undefined} disabled={showBin} onClick={() => void chooseChat(item.id)}>{item.title}{showBin && item.deleted_at && <small className="assistant-bin-expiry">{binDaysLeft(Date.parse(item.deleted_at)+30*86400000,now)} days left</small>}</button>{!selecting && !showBin && <details className="assistant-chat-options"><summary aria-label={'Options for '+item.title}>⋯</summary><div><button disabled={Boolean(chatAction)} onClick={()=>{setError('');setRenameChat(item)}}>Rename chat</button><button disabled={Boolean(chatAction)} onClick={()=>void manageChat(item,'archive')}>{item.archived?'Restore chat':'Archive chat'}</button><button disabled={Boolean(chatAction)} onClick={()=>void manageChat(item,'delete')}>Delete chat</button></div></details>}</div>)}{state && !visibleChats.length && <p>{showBin?'Bin is empty.':showArchived?'No archived chats.':'No conversations yet.'}</p>}</nav>
      <button type="button" className="assistant-sidebar-settings" onClick={() => setPanel('settings')}><SettingsIcon size={18}/>Settings</button>
    </aside>}
    {sidebar && <button type="button" className="assistant-sidebar-scrim" aria-label="Close chat sidebar" onClick={() => setSidebar(false)}/>}
    <section className="assistant-chat" aria-label="Assistant chat">
      <header className="assistant-chat-header"><div>{!sidebar && <button type="button" className="icon-btn" aria-label="Show chat sidebar" onClick={() => setSidebar(true)}><MenuIcon/></button>}<button type="button" className="icon-btn" aria-label="New chat" onClick={newChat}><PlusIcon/></button><div className="assistant-chat-title"><strong>{title}</strong><span>{state ? aiReady ? `${provider} connected` : 'Connect your AI to get started' : 'Loading…'}</span>{state && <span className={'assistant-power ' + power} role="status" aria-label="Virtual machine status"><i aria-hidden="true"/>VM {powerLabel}</span>}</div></div><div><button type="button" className="assistant-sites-button" onClick={() => setPanel('connections')}>Add sites</button><button type="button" className="icon-btn" aria-label="Agent settings" onClick={() => setPanel('settings')}><SettingsIcon/></button></div></header>
      {state?.chats.find(c=>c.id===chat)?.parent_chat_id && <p className="agent-banner assistant-branch-banner">Branched conversation <button type="button" className="assistant-copy" onClick={()=>{const parent=state.chats.find(c=>c.id===state.chats.find(c=>c.id===chat)?.parent_chat_id);if(parent)void chooseChat(parent.id)}} disabled={!state.chats.some(c=>c.id===state.chats.find(c=>c.id===chat)?.parent_chat_id)}>Open original</button></p>}
      {error && <p role="alert" className="assistant-error">{error}</p>}
      {confirmedConnection?.result.source && <p role="status" className="agent-banner">{VM_SOURCES[confirmedConnection.result.source].name} connected. Your sign-in is saved on your private computer. <button aria-label="Dismiss connection confirmation" onClick={()=>setDismissedConnections(current=>[...current,confirmedConnection.id])}>Dismiss</button></p>}
      {archived && <p className="agent-banner">This chat is archived. <button disabled={Boolean(chatAction)} onClick={()=>{const item=state?.chats.find(c=>c.id===chat);if(item)void manageChat(item,'archive')}}>Restore chat</button></p>}
      {state?.provisioning?.error && <p role="alert" className="assistant-error">{state.provisioning.error}</p>}
      <div className="assistant-thread" aria-live="polite">
        <div className="assistant-thread-content">
          {!jobs.length && <div className="assistant-welcome"><span className="assistant-spark">✦</span><h1>{loadingChat ? 'Opening your chat…' : 'What can I help with?'}</h1><p>{aiReady ? 'Plan your day, organize your files, or check your connected sites.' : 'Connect your AI account once. Then keep the conversation here.'}</p>{state && !aiReady && <button type="button" className="assistant-primary" onClick={() => setPanel('setup')}>Connect AI</button>}</div>}
          {jobs.map(job => <article key={job.id} className="assistant-turn"><div className="assistant-user-message">{job.message}{Boolean(job.attachments?.length) && <ChatAttachments items={job.attachments!} jobId={job.id} onError={setError}/>}<MessageTime value={job.created_at} label="Message sent"/><button type="button" className="assistant-copy" aria-label="Copy your message" onClick={()=>void copyMessage(job.message,job.id+'-user')}>{copied===job.id+'-user'?'Copied':'Copy'}</button><button type="button" className="assistant-copy" disabled={branching} onClick={()=>setEditingJob(job)}>Edit</button></div>{job.reply && <div className="assistant-reply">{job.reply}<MessageTime value={job.finished_at || job.started_at || job.created_at} label={pending(job)?"Reply started":"Assistant replied"}/><button type="button" className="assistant-copy" aria-label="Copy assistant message" onClick={()=>void copyMessage(job.reply,job.id+'-reply')}>{copied===job.id+'-reply'?'Copied':'Copy'}</button>{job.status==='completed' && <button type="button" className="assistant-copy" disabled={branching} onClick={()=>void branch(job).catch(e=>setError(e.message))}>{branching?'Branching?':'Branch chat'}</button>}</div>}{pending(job) && job.approvals?.map(request=><AgentApproval key={request.id} request={request} onAnswered={refresh}/>)}{(pending(job) || job.status==='paused') && <div className="assistant-working">{job.status!=='paused' && <span className="assistant-pulse"/>}{vmJobStatus(job,state,now)}{job.status==='queued' && activeTask && activeTask.id!==job.id && <button type="button" onClick={()=>{if(window.confirm('Stop the other task currently using your VM? Changes it already saved will be kept.'))void agentAction('vm/cancel',{id:activeTask.id}).then(refresh).catch(e=>setError(e.message))}}>Stop current task</button>}<AgentRunControls job={job} onChanged={refresh} onError={setError}/></div>}{job.result.steered && <p className="assistant-steered">Continued with your follow-up below.</p>}{job.error && <p role="alert" className="assistant-error">{job.error}</p>}</article>)}<div ref={end}/>
        </div>
      </div>
      <div className="assistant-compose-wrap"><form className="assistant-compose" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();void addAttachments(Array.from(e.dataTransfer.files))}}} onSubmit={e => { e.preventDefault(); void send() }}><label className="sr-only" htmlFor="assistant-message">Message your assistant</label>{attachments.length>0 && <ChatAttachments items={attachments} onRemove={id=>setAttachments(items=>items.filter(a=>a.id!==id))}/>} {preparingAttachments && <p role="status" className="attachment-preparing">Preparing attachments…</p>}<textarea onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void addAttachments(Array.from(e.clipboardData.files))}}} id="assistant-message" placeholder="Message your assistant…" value={message} rows={2} maxLength={12000} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if(e.key==='Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.nativeEvent.isComposing && jobs.some(job=>pending(job)||job.status==='paused') && (message.trim() || attachments.length) && !busy && !preparingAttachments && !dictating && !loadingChat && !archived && aiReady && host){e.preventDefault();void send(true);return} if (e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}/><div><div className="compose-left-actions"><AttachButton disabled={busy || preparingAttachments || archived || loadingChat} onFiles={files=>void addAttachments(files)}/><button type="button" className="assistant-compose-connect" onClick={() => setPanel(aiReady ? 'connections' : 'setup')}>{aiReady ? '+ Add sites' : 'Connect AI'}</button></div><div className="assistant-compose-actions"><DictationButton key={chat || 'new'} enabled={active && !busy && !loadingChat && !archived} onBusy={setDictating} onText={text=>setMessage(previous=>(previous+(previous && !/\s$/.test(previous)?' ':'')+text).slice(0,12000))}/>{jobs.some(job=>pending(job)||job.status==='paused') && <button type="button" className="assistant-queue" aria-label="Queue message" aria-keyshortcuts="Tab" title="Queue after the current task (Tab)" disabled={preparingAttachments || dictating || busy || loadingChat || archived || (!message.trim() && !attachments.length) || !aiReady || !host} onClick={()=>void send(true)}>Queue</button>}<button type="submit" className="assistant-send" aria-label={jobs.some(job=>pending(job)||job.status==='paused')?'Steer agent':'Send message'} title={jobs.some(job=>pending(job)||job.status==='paused')?'Send a follow-up to redirect the current task':'Send message'} disabled={preparingAttachments || dictating || busy || loadingChat || archived || (!message.trim() && !attachments.length) || !aiReady || !host}>↑</button></div></div></form><p className="assistant-compose-note">{jobs.some(job=>pending(job)||job.status==='paused')?'Enter to steer ? Tab to queue ? Shift+Enter for a new line.':'Your assistant can make mistakes. Check important details.'}</p></div>
    </section>
    {editingJob && <EditChatMessage key={editingJob.id} job={editingJob} onClose={()=>setEditingJob(null)} onSave={message=>branch(editingJob,message)}/>}
    {renameChat && <RenameDialog key={renameChat.id} initialValue={renameChat.title} kind="chat" busy={Boolean(chatAction)} error={error} onClose={()=>{setRenameChat(null);setError('')}} onSave={async name=>{if(chatAction)return;setChatAction(renameChat.id);setError('');try{await agentAction('vm/chats/rename',{id:renameChat.id,title:name});setRenameChat(null);await refresh()}catch(e){setError(e instanceof Error?e.message:'Could not rename chat.')}finally{setChatAction(null)}}}/>}
    {state && panel && <AgentSettings state={state} now={now} mode={panel} aiReady={aiReady} onClose={closePanel} refresh={refresh}/>}
  </main>
}
