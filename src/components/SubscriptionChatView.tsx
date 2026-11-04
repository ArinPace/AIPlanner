import type {ChatMirror,ChatMirrorPlan} from '../lib/chatSync'
import {prepareRelayFile,storeRelayFile,relayFileLink,downloadRelayFile,RELAY_BATCH_MAX,type RelayFile} from '../lib/relayFiles'
import {nativeRequest} from '../lib/platform'
import {useCallback,useEffect,useRef,useState} from 'react'
import {subscriptionChatRequest} from '../lib/api'
import {useChatDraft} from '../lib/chatDraft'
import {VM_SOURCES} from '../lib/vm'
import type {SubscriptionChat,SubscriptionWorkspace} from '../lib/subscriptionChat'
import {CloseIcon,MenuIcon,PlusIcon,SettingsIcon} from './Icons'
import {ChatMarkdown} from './ChatMarkdown'
import {AttachButton} from './ChatAttachments'
import {DictationButton} from './DictationButton'
import {RenameDialog} from './RenameDialog'
import {AgentInstructions} from './AgentInstructions'
import {GoogleCalendarAccounts} from './GoogleCalendarAccounts'
import {SourceConnectionAlerts} from './SourceConnectionAlerts'
export function SubscriptionChatView({username,active,sidebar,setSidebar}:{username:string;active:boolean;sidebar:boolean;setSidebar:(value:boolean)=>void}){
 const [workspace,setWorkspace]=useState<SubscriptionWorkspace|null>(null),[chatId,setChatId]=useState<string|null>(null)
 const selected=useRef<string|null>(null),epoch=useRef(0),alive=useRef(true)
 const native=Boolean(window.plannerNativeChatGPTPortal)
 const [relayReady,setRelayReady]=useState(false),[relayPrompt,setRelayPrompt]=useState(''),[relayText,setRelayText]=useState(''),[relayPhase,setRelayPhase]=useState(''),[remoteDraft,setRemoteDraft]=useState<string|null>(null)
 type Recovery={chatId:string;turnId:string;prompt:string;reply:string;outputs?:{key:string;name:string}[];providerUrl?:string}
 const recoveryKey='planner-relay-recovery:'+username
 const [recovery,setRecovery]=useState<Recovery|null>(()=>{try{return JSON.parse(localStorage.getItem(recoveryKey)||'null')}catch{return null}})
 const cancelRelay=useRef(false),mirrorLock=useRef(false)
 const [syncing,setSyncing]=useState(false),[syncNotice,setSyncNotice]=useState('')
 const [syncConflict,setSyncConflict]=useState<{chat:SubscriptionChat;remote:ChatMirror}|null>(null)
 useEffect(()=>{if(!native||!active)return;let stopped=false;const read=async()=>{try{const state=await nativeRequest<{ready?:boolean;needsLogin?:boolean}>({action:'chatGPTRelayStatus',account:username});if(!stopped)setRelayReady(state.ready===true&&!state.needsLogin)}catch{if(!stopped)setRelayReady(false)}};void read();const timer=setInterval(()=>void read(),5000);return()=>{stopped=true;clearInterval(timer)}},[native,active,username])
 const {message,setMessage,selectDraft}=useChatDraft('subscription:'+username)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[older,setOlder]=useState(false)
 const [panel,setPanel]=useState<'connections'|'settings'|null>(null),[filter,setFilter]=useState<'active'|'archived'|'bin'>('active')
 const [rename,setRename]=useState<SubscriptionChat|null>(null),[attachments,setAttachments]=useState<RelayFile[]>([]),[preparing,setPreparing]=useState(false),[dictating,setDictating]=useState(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[])
 useEffect(()=>{if(!panel)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setPanel(null)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[panel])
 const refresh=useCallback(async(id=selected.current)=>{
  const generation=epoch.current
  const result=await subscriptionChatRequest(id||undefined)
  if(!alive.current||generation!==epoch.current)return
  selected.current=result.chat.id;setChatId(result.chat.id);setWorkspace(result)
  return result
 },[])
 useEffect(()=>{
  if(!active)return
  let cancelled=false;setLoading(true)
  void refresh().then(result=>{if(result&&!cancelled)selectDraft(result.chat.id)}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)})
  const update=()=>void refresh().catch(e=>{if(!cancelled)setError(e.message)})
  const timer=setInterval(update,30000);window.addEventListener('focus',update)
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',update)}
 },[active,refresh,selectDraft])
 async function choose(chat:SubscriptionChat){
  if(relayPrompt)return
  epoch.current++;selected.current=chat.id;setChatId(chat.id);selectDraft(chat.id);setAttachments([]);setSyncNotice(chat.provider_url?'':'This chat appears in ChatGPT history after its first message while signed in.');setError('');setLoading(true)
  try{await refresh(chat.id);if(window.innerWidth<701)setSidebar(false)}catch(e){setError(e instanceof Error?e.message:'Could not open chat.')}finally{setLoading(false)}
 }
 async function create(){
  if(busy)return;setBusy(true);setError('')
  try{const chat=await subscriptionChatRequest<SubscriptionChat>(undefined,{action:'create'});setFilter('active');await choose(chat)}catch(e){setError(e instanceof Error?e.message:'Could not create chat.')}finally{setBusy(false)}
 }
 async function mirrorChat(row:SubscriptionChat,prefer?:'planner'|'chatgpt'){
  if(!row.provider_url)return
  if((window.plannerNativeChatGPTRelayVersion||0)<3)throw Error('Update the iPhone app to sync ChatGPT conversation names and history.')
  const remote=await nativeRequest<ChatMirror>({action:'chatGPTRelayMirror',account:username,url:row.provider_url})
  const args={action:'relay_mirror',chatId:row.id,expectedUpdatedAt:row.updated_at,url:row.provider_url,observed:remote,prefer}
  const {plan}=await subscriptionChatRequest<{plan:ChatMirrorPlan}>(undefined,args)
  if(plan.conflicts.length){setSyncConflict({chat:row,remote});throw Error('This chat changed on both platforms. Choose which version to keep.')}
  const applied=Object.keys(plan.push).length?await nativeRequest<ChatMirror>({action:'chatGPTRelayMirror',account:username,url:row.provider_url,patch:plan.push,expected:remote}):remote
  await subscriptionChatRequest(undefined,{...args,applied})
 }
 async function syncChats(prefer?:'planner'|'chatgpt'){
  if(!native||busy||mirrorLock.current)return
  mirrorLock.current=true;setSyncing(true);setSyncNotice('Syncing ChatGPT conversations…');setError('')
  try{
   const current=await subscriptionChatRequest()
   const rows=syncConflict&&prefer?[current.chats.find(c=>c.id===syncConflict.chat.id)].filter((c):c is SubscriptionChat=>Boolean(c)):current.chats.filter(c=>Boolean(c.provider_url))
   if(!rows.length){setSyncNotice('Chats appear in ChatGPT history after their first message while signed in.');return}
   const failures:string[]=[]
   for(const row of rows){try{await mirrorChat(row,prefer)}catch(e){failures.push(row.title+': '+(e instanceof Error?e.message:'Sync failed'))}}
   if(failures.length){await refresh();throw Error(failures.join(' · '))}
   setSyncConflict(null);setSyncNotice('ChatGPT conversations synced.');await refresh()
  }catch(e){setError(e instanceof Error?e.message:'Could not sync ChatGPT chats.');setSyncNotice('Chat sync needs attention. Changes remain saved in Planner.')}
  finally{mirrorLock.current=false;setSyncing(false)}
 }
 async function update(chat:SubscriptionChat,patch:Record<string,unknown>){
  if(busy||mirrorLock.current)return
  if(patch.deleted===true&&chat.provider_url&&!window.confirm('Delete this conversation from ChatGPT too? ChatGPT deletion is permanent; only the Planner copy can remain recoverable in Bin.'))return
  setBusy(true);setError('')
  try{const saved=await subscriptionChatRequest<SubscriptionChat>(undefined,{action:'update',id:chat.id,...patch});setRename(null);if(native&&saved.provider_url&&Object.keys(patch).some(k=>['title','archived','deleted'].includes(k))){setSyncing(true);try{await mirrorChat(saved);setSyncNotice('ChatGPT conversation synced.')}finally{setSyncing(false)}}else if(saved.provider_url&&!native){setSyncNotice('Saved in Planner. Open the iPhone app to sync ChatGPT.')}await refresh()}catch(e){setError(e instanceof Error?e.message:'Could not update chat.')}finally{setBusy(false);await refresh().catch(()=>{})}
 }
 async function connect(){setError('');try{if(window.plannerNativeChatGPTPortal){await nativeRequest({action:'chatGPTPortal',account:username});return}await subscriptionChatRequest(undefined,{action:'connect'})}catch(e){setError(e instanceof Error?e.message:'Could not connect ChatGPT.')}}
 async function saveReply(value:Recovery){
  while(value.outputs?.length){
   const output=value.outputs[0];setRelayPhase('Downloading '+output.name+'…')
   const file=await nativeRequest<Omit<RelayFile,'id'>>({action:'chatGPTRelayDownload',account:username,key:output.key})
   const received={...file,id:crypto.randomUUID()},id=await storeRelayFile(value.chatId,received)
   value={...value,reply:value.reply+'\n\n'+relayFileLink(received.name,id),outputs:value.outputs.slice(1)}
   setRecovery(value);try{localStorage.setItem(recoveryKey,JSON.stringify(value))}catch{/* Keep in-memory recovery. */}
  }
  if(!value.reply.trim())throw Error('No readable response or completed file download was received.')
  if(value.providerUrl)await subscriptionChatRequest(undefined,{action:'relay_bind',chatId:value.chatId,url:value.providerUrl})
  await subscriptionChatRequest(undefined,{action:'relay_save',chatId:value.chatId,turnId:value.turnId,prompt:value.prompt,reply:value.reply})
  localStorage.removeItem(recoveryKey);setRecovery(null);if(selected.current===value.chatId)setMessage('');setAttachments([]);const updated=await refresh(value.chatId);if(value.providerUrl&&updated){try{await mirrorChat(updated.chat);setSyncNotice('ChatGPT conversation synced.')}catch(e){setSyncNotice(e instanceof Error?e.message:'Chat metadata sync pending.')}}
 }
 async function send(){
  if(!native){await connect();return}
  const prompt=message.trim()||(attachments.length?'Please review the attached files.':''),id=chatId
  if(!prompt||!id||busy||recovery)return
  if(attachments.length&&(window.plannerNativeChatGPTRelayVersion||0)<2){setError('Update the iPhone app to enable file forwarding.');return}
  setBusy(true);setError('');setRelayPrompt(prompt);setRelayText('');setRelayPhase('Connecting…');cancelRelay.current=false
  const turnId=crypto.randomUUID(),scope=epoch.current
  try{
   const inputLinks:string[]=[]
   for(const file of attachments){setRelayPhase('Uploading '+file.name+'…');inputLinks.push(relayFileLink(file.name,await storeRelayFile(id,file)))}
   const savedPrompt=prompt+(inputLinks.length?'\n\n'+inputLinks.join('\n'):'')
   setRelayPhase('Sending to ChatGPT…')
   const context=(workspace?.messages||[]).slice(-10).map(item=>item.role+': '+item.content.slice(0,2000)).join('\n\n')
   await nativeRequest({action:'chatGPTRelaySend',account:username,chatId:id,text:prompt,context,url:workspace?.chat.provider_url,files:attachments.map(({name,mime,size,data})=>({name,mime,size,data}))})
   setRelayPhase('Working… Keep Planner open.')
   while(!cancelRelay.current&&alive.current&&scope===epoch.current){
    await new Promise(resolve=>setTimeout(resolve,1500))
    const result=await nativeRequest<{phase:string;text?:string;message?:string;needsLogin?:boolean;url?:string;files?:{key:string;name:string}[]}>({action:'chatGPTRelayStatus',account:username})
    if(scope!==epoch.current||!alive.current)return
    setRelayText(result.text||'')
    if(result.phase==='completed'){
     const value:Recovery={chatId:id,turnId,prompt:savedPrompt,reply:result.text||'',outputs:result.files||[],providerUrl:result.url&&/^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]+$/.test(result.url)?result.url:undefined}
     setRecovery(value);try{localStorage.setItem(recoveryKey,JSON.stringify(value))}catch{setError('Reply received. Keep this page open until it is saved.')}
     setRelayPhase('Saving reply…');await saveReply(value);setMessage('');setRelayPrompt('');setRelayText('');setAttachments([]);return
    }
    if(result.phase==='attention'||result.needsLogin)throw new Error(result.message||'ChatGPT needs attention. Open its session; do not resend until you check it.')
   }
  }catch(e){setError(e instanceof Error?e.message:'Relay failed. Open the session before retrying.')}finally{setBusy(false);setRelayPhase('');setRelayPrompt('');setRelayText('')}
 }
 async function stop(){cancelRelay.current=true;try{await nativeRequest({action:'chatGPTRelayStop',account:username});setRelayPhase('Stopping…')}catch(e){setError(e instanceof Error?e.message:'Open the session to stop this response.')}}
 async function inspectRemoteDraft(){try{const result=await nativeRequest<{text:string}>({action:'chatGPTRelayDraft',account:username});setRemoteDraft(result.text)}catch(e){setError(e instanceof Error?e.message:'Could not inspect draft.')}}
 async function clearRemoteDraft(){if(remoteDraft===null)return;try{await nativeRequest({action:'chatGPTRelayClearDraft',account:username,expected:remoteDraft});setRemoteDraft(null);setError('')}catch(e){setError(e instanceof Error?e.message:'Could not clear draft.')}}
 async function addFiles(files:File[]){
  if(preparing)return
  const scope=epoch.current;setPreparing(true);setError('')
  try{let next=[...attachments];for(const file of files){const item=await prepareRelayFile(file);if(next.length>=4||next.reduce((sum,a)=>sum+a.size,0)+item.size>RELAY_BATCH_MAX)throw new Error('Attach up to four files, 25 MB each and 50 MB total.');next.push(item)}if(scope===epoch.current)setAttachments(next)}catch(e){setError(e instanceof Error?e.message:'Could not prepare attachments.')}finally{setPreparing(false)}
 }
 useEffect(()=>{
  if(!active||!native||busy||syncing||preparing||dictating||recovery||message.trim()||attachments.length||panel||rename||syncConflict)return
  const timer=setTimeout(()=>void syncChats(),60000)
  return()=>clearTimeout(timer)
 },[active,native,busy,syncing,message,attachments.length,panel,rename,preparing,dictating,recovery,syncConflict,workspace?.chat.updated_at])
 const chat=workspace?.chats.find(c=>c.id===chatId)||workspace?.chat
 const visible=workspace?.chats.filter(c=>filter==='bin'?Boolean(c.deleted_at):!c.deleted_at&&Boolean(c.archived)===(filter==='archived'))||[]
 return <main className={'assistant-app'+(sidebar?' sidebar-open':'')} aria-label="Subscription Chat">
 {sidebar&&<aside className="assistant-sidebar" aria-label="Chat sidebar" inert={Boolean(panel||rename)}><div className="assistant-sidebar-top"><strong>Your chats</strong><button type="button" className="icon-btn" aria-label="Hide chat sidebar" onClick={()=>setSidebar(false)}><CloseIcon size={18}/></button></div>
 <button type="button" className="assistant-new-chat" disabled={busy||syncing} onClick={()=>void create()}><PlusIcon size={18}/>New chat</button>
 <SourceConnectionAlerts username={username} active={active} refreshKey={JSON.stringify(workspace?.google)} onManage={()=>setPanel('connections')}/>
 <button type="button" className="assistant-archive-toggle" onClick={()=>setFilter(filter==='archived'?'active':'archived')}>{filter==='archived'?'Back to chats':'Archived chats'}</button><button type="button" className="assistant-archive-toggle" onClick={()=>setFilter(filter==='bin'?'active':'bin')}>{filter==='bin'?'Back to chats':'Bin'}</button>
 <nav aria-label="Conversations" className="assistant-conversations">{visible.map(row=><div className="assistant-chat-row" key={row.id}><button type="button" aria-current={row.id===chatId?'page':undefined} disabled={busy||syncing} onClick={()=>void choose(row)}>{(row.is_main||row.pinned)&&'📌 '}{row.title}</button><details className="assistant-chat-options"><summary aria-label={'Options for '+row.title}>⋯</summary><div>{row.deleted_at?<button disabled={busy||syncing} onClick={()=>void update(row,{deleted:false})}>Restore chat</button>:<><button disabled={busy||syncing||row.is_main} onClick={()=>void update(row,{pinned:!row.pinned})}>{row.pinned?'Unpin chat':'Pin chat'}</button><button disabled={busy||syncing} onClick={()=>setRename(row)}>Rename chat</button><button disabled={busy||syncing} onClick={()=>void update(row,{archived:!row.archived})}>{row.archived?'Restore chat':'Archive chat'}</button><button disabled={busy||syncing} onClick={()=>void update(row,{deleted:true})}>Move to bin</button></>}</div></details></div>)}</nav>
 <button type="button" className="assistant-archive-toggle" disabled={busy||syncing||!native} onClick={()=>void syncChats()}>Sync ChatGPT chats</button>
 <button type="button" className="assistant-sidebar-settings" onClick={()=>setPanel('settings')}><SettingsIcon size={18}/>Settings</button>
</aside>}
 {sidebar&&<button type="button" className="assistant-sidebar-scrim" aria-label="Close chat sidebar" onClick={()=>setSidebar(false)}/>}
 <section className="assistant-chat" aria-label="Subscription conversation" inert={Boolean(panel||rename)}><header className="assistant-chat-header"><div>{!sidebar&&<button type="button" className="icon-btn" aria-label="Show chat sidebar" onClick={()=>setSidebar(true)}><MenuIcon/></button>}<button type="button" className="icon-btn" aria-label="New chat" disabled={busy||syncing} onClick={()=>void create()}><PlusIcon/></button><div className="assistant-chat-title"><strong>{chat?.title||'Main Chat'}</strong><span>ChatGPT subscription</span><span role="status">{window.plannerNativeChatGPTPortal?relayReady?'ChatGPT session ready':'Sign in to ChatGPT':'Not connected'}</span></div></div><div>{native&&<button type="button" className="assistant-sites-button" onClick={()=>void connect()}>ChatGPT session</button>}<button type="button" className="assistant-sites-button" onClick={()=>setPanel('connections')}>Add sites</button><button type="button" className="icon-btn" aria-label="Chat settings" onClick={()=>setPanel('settings')}><SettingsIcon/></button></div></header>
 {error&&<p role="alert" className="assistant-error">{error}{native&&/unsent draft/i.test(error)&&<button type="button" disabled={busy||syncing} onClick={()=>void inspectRemoteDraft()}>Review ChatGPT draft</button>}<button type="button" className="icon-btn" aria-label="Dismiss chat error" onClick={()=>setError('')}>×</button></p>}
 {(chat?.archived||chat?.deleted_at)&&<p className="agent-banner">This chat is {chat.deleted_at?'in Bin':'archived'}. Restore it from the sidebar to continue.</p>}
 <div className="assistant-thread"><div className="assistant-thread-content">{workspace?.hasOlder&&<button type="button" disabled={older} onClick={()=>{const first=workspace.messages[0];if(!first)return;setOlder(true);void subscriptionChatRequest<SubscriptionWorkspace>(chatId||undefined,undefined,first.id).then(result=>setWorkspace(current=>current?.chat.id===result.chat.id?{...current,hasOlder:result.hasOlder,messages:[...result.messages,...current.messages.filter(item=>!result.messages.some(older=>older.id===item.id))]}:current)).catch(e=>setError(e.message)).finally(()=>setOlder(false))}}>Load earlier messages</button>}
 {!workspace?.messages.length&&<div className="assistant-welcome"><span className="assistant-spark">✦</span><h1>{loading?'Opening your chat…':'What can I help with?'}</h1><p>Plan your day, work with your files, and keep your tasks organized.</p><button type="button" className="assistant-primary" onClick={()=>{if(!window.plannerNativeChatGPTPortal)setPanel('settings');void connect()}}>{window.plannerNativeChatGPTPortal?'Connect ChatGPT session':'Connect ChatGPT'}</button><p className="quiet">{window.plannerNativeChatGPTPortal?'Load the session once, then send messages here. You can test basic chat as a guest. Keep Planner open while working.':'Subscription connection setup is still required. Your drafts stay saved here.'}</p></div>}
 {workspace?.messages.map(item=><article className="assistant-turn" key={item.id}><div className={item.role==='user'?'assistant-user-message':'assistant-reply'} role="group" aria-label={item.role==='user'?'Your message':'Assistant message'} onClickCapture={event=>{const link=(event.target as Element).closest('a');const id=link?.getAttribute('href')?.match(/^#planner-chat-file\/([a-f0-9-]{36})$/i)?.[1];if(id){event.preventDefault();event.stopPropagation();void downloadRelayFile(id).catch(e=>setError(e.message))}}}><ChatMarkdown text={item.content}/><time className="assistant-message-time" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time><button type="button" className="assistant-copy" onClick={()=>void navigator.clipboard.writeText(item.content).catch(()=>setError('Could not copy this message.'))}>Copy</button></div></article>)}{relayPrompt&&<article className="assistant-turn"><div className="assistant-user-message"><ChatMarkdown text={relayPrompt}/></div>{relayText&&<div className="assistant-reply"><ChatMarkdown text={relayText}/></div>}<div role="status" className="assistant-working">{relayPhase}<button type="button" disabled={relayPhase==='Connecting…'} onClick={()=>void stop()}>Stop</button></div></article>}{recovery&&<p role="alert">A reply was received. File transfer or cloud saving still needs to finish. <button type="button" onClick={()=>void saveReply(recovery).catch(e=>setError(e.message))}>{recovery.outputs?.length?'Retry file transfer':'Save reply'}</button></p>}</div></div>
 <div className="assistant-compose-wrap"><form className="assistant-compose" onSubmit={e=>{e.preventDefault();void send()}}>{Boolean(attachments.length)&&<div className="chat-attachment-list">{attachments.map(file=><div className="chat-attachment" key={file.id}><span>{file.name} · {(file.size/1024).toFixed(0)} KB</span><button type="button" disabled={busy||syncing} aria-label={'Remove attachment '+file.name} onClick={()=>setAttachments(items=>items.filter(item=>item.id!==file.id))}>×</button></div>)}</div>}<label className="sr-only" htmlFor="subscription-message">Message ChatGPT</label><textarea id="subscription-message" disabled={loading||busy||syncing||(native&&!relayReady)||!chat||Boolean(chat.archived||chat.deleted_at)} rows={2} maxLength={10000} placeholder="Message your assistant…" value={message} onChange={e=>setMessage(e.target.value)} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void addFiles(Array.from(e.clipboardData.files))}}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div className="assistant-compose-toolbar"><div className="compose-left-actions"><AttachButton accept="*/*" description="Original files: up to four, 25 MB each and 50 MB total. ChatGPT may reject unsupported formats." disabled={preparing||busy||syncing} onFiles={files=>void addFiles(files)}/><button type="button" className="assistant-compose-connect" onClick={()=>setPanel('connections')}>+ Add sites</button></div><div className="assistant-compose-actions"><button type="button" className="planning-icon-button" aria-label="Begin Planning" title="Connect ChatGPT to begin planning" disabled>▣</button><DictationButton key={chatId||'subscription-new'} enabled={active&&!preparing&&!busy&&!syncing&&!loading&&Boolean(chat)&&!chat?.archived&&!chat?.deleted_at} onBusy={setDictating} onText={text=>setMessage(old=>(old+(old?' ':'')+text).slice(0,10000))}/><button type="submit" className="assistant-send" aria-label="Send message" title={native?'Send through your ChatGPT website session':'ChatGPT subscription setup is required'} disabled={!native||!relayReady||busy||syncing||(!message.trim()&&!attachments.length)||Boolean(recovery)}>↑</button></div></div></form><p className="assistant-compose-note">{syncing?'Syncing ChatGPT conversations…':relayPhase||syncNotice|| (preparing?'Preparing files…':dictating?'Listening…':window.plannerNativeChatGPTPortal?'Uses your ChatGPT website session. Keep Planner open while working.':'Connect your ChatGPT subscription to send messages. Shift+Enter for a new line.')}</p></div>
 </section>
 {panel&&<div className="modal-backdrop" onMouseDown={()=>setPanel(null)}><section role="dialog" aria-modal="true" aria-label={panel==='settings'?'Chat settings':'Chat connected sites'} className="event-modal device-settings" onMouseDown={e=>e.stopPropagation()}><div className="files-dialog-head"><h2>{panel==='settings'?'Chat settings':'Connected sites'}</h2><button type="button" className="icon-btn" aria-label="Close chat settings" onClick={()=>setPanel(null)}><CloseIcon/></button></div>{error&&<p role="alert" className="form-error">{error}</p>}<section className="assistant-settings-section"><h3>ChatGPT subscription</h3><p>{window.plannerNativeChatGPTPortal?'Load or sign in to the ChatGPT session, then return to Planner. Text messages and replies are forwarded through that session. Saved conversations can sync names and archive state after signing in. Empty chats appear in ChatGPT history after the first message. Planner tools and unattended runs are not connected yet.':'Subscription sign-in is not configured for Planner yet. Chats and drafts are saved separately from Agent.'}</p><button type="button" onClick={()=>void connect()}>{window.plannerNativeChatGPTPortal?'Connect ChatGPT session':'Connect ChatGPT'}</button>{!native&&<p><a href="https://developers.openai.com/siwc/request-client-id" target="_blank" rel="noreferrer">Subscription connection requirements</a></p>}<p>Browser access and scheduled runs are not connected for this workspace yet.</p></section>{panel==='settings'?<><p className="quiet">These personal instructions are shared across your Planner agents.</p><AgentInstructions/></>:<><GoogleCalendarAccounts google={workspace?.google} refresh={async()=>{await refresh()}}/><section className="assistant-settings-section"><h3>Sources</h3>{workspace?.sources.map(source=><p key={source}>{VM_SOURCES[source].name}</p>)}<p className="quiet">Connected account data belongs to your Planner account. Chat will need its own browsing integration for websites.</p></section></>}</section></div>}
 {remoteDraft!==null&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="ChatGPT unsent draft" className="event-modal"><h2>ChatGPT unsent draft</h2><p>This text is still in the website’s composer. Your Planner draft stays unchanged.</p><pre style={{whiteSpace:'pre-wrap',maxHeight:'40vh',overflow:'auto'}}>{remoteDraft||'(empty)'}</pre><button type="button" onClick={()=>setRemoteDraft(null)}>Keep draft</button><button type="button" onClick={()=>void clearRemoteDraft()}>Clear ChatGPT draft</button></section></div>}
 {syncConflict&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Chat sync conflict" className="event-modal"><h2>Choose the chat version</h2><p>Planner: {syncConflict.chat.title}</p><p>ChatGPT: {syncConflict.remote.title}</p><p>Both changed since the last sync. Choose which version to keep for the conflicting fields.</p><button disabled={syncing} onClick={()=>void syncChats('planner')}>Keep Planner changes</button><button disabled={syncing} onClick={()=>void syncChats('chatgpt')}>Keep ChatGPT changes</button><button disabled={syncing} onClick={()=>setSyncConflict(null)}>Later</button></section></div>}
 {rename&&<RenameDialog initialValue={rename.title} kind="chat" busy={busy} error={error} onClose={()=>setRename(null)} onSave={title=>update(rename,{title})}/>}
 </main>
}
