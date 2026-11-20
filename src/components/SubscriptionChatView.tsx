import {isDuoVerification} from '../lib/duoVerification'
import {whoopBackgroundIds,isWhoopBackground} from '../lib/whoopBackground'
import {unpackRelayBundle} from '../lib/relayFileBundle'
import {ChatAttempt} from './ChatAttempt'
import {ChatFilePreview} from './ChatFilePreview'
import {peekChatCache,readChatCache,writeChatCache} from '../lib/chatCache'
import {toolTurnMessage,toolResultsMessage,relayCalls,relayVisible,unsentRelayRequest} from '../lib/subscriptionTools'
import type {ChatMirror,ChatMirrorPlan} from '../lib/chatSync'
import {prepareRelayFile,storeRelayFile,relayFileLink,RELAY_BATCH_MAX,type RelayFile} from '../lib/relayFiles'
import {nativeRequest} from '../lib/platform'
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react'
import {subscriptionChatRequest,invalidateFilesCache} from '../lib/api'
import {useChatDraft} from '../lib/chatDraft'
import {VM_SOURCES} from '../lib/vm'
import type {SubscriptionAttempt,SubscriptionChat,SubscriptionWorkspace} from '../lib/subscriptionChat'
import {CloseIcon,MenuIcon,PlusIcon,SettingsIcon} from './Icons'
import {ChatMarkdown} from './ChatMarkdown'
import {AttachButton} from './ChatAttachments'
import {DictationButton} from './DictationButton'
import {RenameDialog} from './RenameDialog'
import {AgentInstructions} from './AgentInstructions'
import {ConnectedApps} from './ConnectedApps'
import {SourceConnectionAlerts} from './SourceConnectionAlerts'
const chatConnectionError=(error:unknown)=>error instanceof Error&&(/Could not reach the server|Server temporarily unavailable|Load failed|Failed to fetch/i.test(error.message)||[408,429,500,502,503,504].includes((error as Error&{status?:number}).status||0))
export function SubscriptionChatView({username,active,sidebar,setSidebar}:{username:string;active:boolean;sidebar:boolean;setSidebar:(value:boolean)=>void}){
 const [tutorOpen,setTutorOpen]=useState(false)
 const [schedulePrefs,setSchedulePrefs]=useState<{enabled:boolean;schedule:{times:string[];timezone:string;instructions?:string};updatedAt:string|null}|null>(null)
 const [scheduleError,setScheduleError]=useState(''),[scheduleSaving,setScheduleSaving]=useState(false)
 const scheduleLock=useRef(false)
 useEffect(()=>{void readChatCache<SubscriptionWorkspace>(username,'subscription-main')},[username])
 const cachedWorkspace=peekChatCache<SubscriptionWorkspace>(username,'subscription-main')
 const [workspace,setWorkspace]=useState<SubscriptionWorkspace|null>(cachedWorkspace),[chatId,setChatId]=useState<string|null>(cachedWorkspace?.chat.id||null)
 const workspaceRef=useRef(workspace);workspaceRef.current=workspace
 const thread=useRef<HTMLDivElement>(null),followThread=useRef(true)
 useLayoutEffect(()=>{if(active&&followThread.current&&thread.current)thread.current.scrollTop=thread.current.scrollHeight},[active,workspace?.messages,workspace?.attempts])
 const [activeAttempt,setActiveAttempt]=useState<string|null>(null)
 const rememberAttempt=(attempt:SubscriptionAttempt)=>setWorkspace(current=>current?{...current,attempts:[...(current.attempts||[]).filter(item=>item.id!==attempt.id),attempt]}:current)
 useEffect(()=>{if(workspace?.chat.is_main)writeChatCache(username,'subscription-main',{...workspace,messages:workspace.messages.slice(-8),hasOlder:workspace.hasOlder||workspace.messages.length>8,google:undefined})},[username,workspace])
 const selected=useRef<string|null>(cachedWorkspace?.chat.id||null),epoch=useRef(0),alive=useRef(true)
 const native=Boolean(window.plannerNativeChatGPTPortal)
 const [previewFile,setPreviewFile]=useState<string|null>(null)
 const [signedIn,setSignedIn]=useState(()=>{try{return sessionStorage.getItem('planner-chat-signed-in:'+username)==='true'}catch{return false}}),[sessionState,setSessionState]=useState<'checking'|'connected'|'signed-out'|'unavailable'>(native?'checking':'signed-out')
 const [relayReady,setRelayReady]=useState(false),[relayPrompt,setRelayPrompt]=useState(''),[relayText,setRelayText]=useState(''),[relayPhase,setRelayPhase]=useState(''),[remoteDraft,setRemoteDraft]=useState<string|null>(null)
 type Recovery={bundleProgress?:{key:string;completed:string[]};chatId:string;turnId:string;prompt:string;reply:string;outputs?:{key:string;name:string}[];providerUrl?:string;toolTurnId?:string}
 const recoveryKey='planner-relay-recovery:'+username
 const [recovery,setRecovery]=useState<Recovery|null>(()=>{try{return JSON.parse(localStorage.getItem(recoveryKey)||'null')}catch{return null}})
 const savingReply=useRef(false)
 const sendLock=useRef(false),restoreAttempted=useRef(new Set<string>())
 const activeRequestKey='planner-relay-active:'+username
 const cancelRelay=useRef(false),mirrorLock=useRef(false),toolTurn=useRef<{chatId:string;turnId:string}|null>(null)
 const [interaction,setInteraction]=useState(false)
 const automaticSignIn=useRef<string|null>(null)
 const [syncing,setSyncing]=useState(false),[syncNotice,setSyncNotice]=useState('')
 const [syncConflict,setSyncConflict]=useState<{chat:SubscriptionChat;remote:ChatMirror}|null>(null)
 useEffect(()=>{
  if(!native||!active)return
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined
  const read=async()=>{let delay=1000;try{
   const state=await nativeRequest<{ready?:boolean;needsLogin?:boolean;interaction?:boolean;running?:boolean;phase?:string;guest?:boolean}>({action:'chatGPTRelayStatus',account:username,peek:true})
   if(stopped)return
   if(state.interaction===false)setError(current=>/website sign-in is pending/i.test(current)?'':current)
   if(state.needsLogin||state.guest){setSignedIn(false);setSessionState('signed-out');try{sessionStorage.removeItem('planner-chat-signed-in:'+username)}catch{};delay=5000}
   else if(state.ready===true||state.interaction===true||state.running===true){setSignedIn(true);setSessionState('connected');try{sessionStorage.setItem('planner-chat-signed-in:'+username,'true')}catch{};delay=5000}
   setRelayReady((state.ready===true||state.interaction===true)&&!state.needsLogin)
   const current=workspaceRef.current,last=current?.messages.at(-1)
   const pendingMessage=last?.role==='assistant'&&/duo|sign.in/i.test(last.content)&&/pending|approve|timed out|try again/i.test(last.content)
   const key=current?.chat.id+':'+(last?.id||'pending')
   if(current&&!isDuoVerification(last?.content||'')&& !sendLock.current && !document.querySelector('[role="dialog"]') && (state.interaction===true||pendingMessage) && automaticSignIn.current!==key){
    automaticSignIn.current=key
    await nativeRequest({action:'chatGPTSiteSignIn',account:username,chatId:current.chat.id,url:current.chat.provider_url,intent:'interaction'})
   }
  }catch{if(!stopped){setRelayReady(false);setSessionState('unavailable');delay=5000}}
  finally{if(!stopped)timer=setTimeout(()=>void read(),delay)}}
  void read();return()=>{stopped=true;if(timer)clearTimeout(timer)}
 },[native,active,username])

 const {message,setMessage,selectDraft}=useChatDraft('subscription:'+username)
 const composerInput=useRef<HTMLTextAreaElement>(null)
 useLayoutEffect(()=>{if(active&&followThread.current&&thread.current)thread.current.scrollTop=thread.current.scrollHeight},[active,relayText,relayPhase])
 useLayoutEffect(()=>{const input=composerInput.current;if(input){input.style.height='38px';input.style.height=Math.min(144,Math.max(38,input.scrollHeight))+'px'}},[message])
 const [connectionIssue,setConnectionIssue]=useState(false)
 const [error,setError]=useState(''),[restoring,setRestoring]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[older,setOlder]=useState(false)
 const [panel,setPanel]=useState<'connections'|'settings'|null>(null),[filter,setFilter]=useState<'active'|'archived'|'bin'>('active')
 useEffect(()=>{const connected=()=>setPanel(null);window.addEventListener('planner-whoop-connected',connected);return()=>window.removeEventListener('planner-whoop-connected',connected)},[])
 const [rename,setRename]=useState<SubscriptionChat|null>(null),[attachments,setAttachments]=useState<RelayFile[]>([]),[preparing,setPreparing]=useState(false),[dictating,setDictating]=useState(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[])
 useEffect(()=>{if(!panel)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setPanel(null)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[panel])
 const latestRefresh=useRef(0)
 const refresh=useCallback(async(id=selected.current,fast=false)=>{
  const generation=epoch.current,refreshVersion=++latestRefresh.current
  const result=await subscriptionChatRequest(id||undefined,undefined,undefined,fast).catch(error=>{if(!alive.current||generation!==epoch.current||refreshVersion!==latestRefresh.current)return null;throw error})
  if(!result||!alive.current||generation!==epoch.current||refreshVersion!==latestRefresh.current)return
  setConnectionIssue(false);setError(current=>chatConnectionError(new Error(current))?'':current)
  selected.current=result.chat.id;setChatId(result.chat.id);setWorkspace(result)
  if(result.chat.is_main)writeChatCache(username,'subscription-main',{...result,messages:result.messages.slice(-8),hasOlder:result.hasOlder||result.messages.length>8,google:undefined})
  return result
 },[username])
 useEffect(()=>{
  if(!active)return
  let cancelled=false,fresh=false;setLoading(!workspaceRef.current)
  if(!workspaceRef.current)void readChatCache<SubscriptionWorkspace>(username,'subscription-main').then(saved=>{if(saved&&!cancelled&&!fresh&&!workspaceRef.current){selected.current=saved.chat.id;setChatId(saved.chat.id);setWorkspace(saved);selectDraft(saved.chat.id);setLoading(false)}})
  let retry:ReturnType<typeof setTimeout>|undefined,failures=0
  const failed=(error:Error)=>{if(cancelled)return;if(chatConnectionError(error)){setConnectionIssue(true);if(retry)clearTimeout(retry);retry=setTimeout(update,Math.min(30000,1500*2**Math.min(5,failures++)))}else setError(error.message)}
  const update=()=>void refresh().then(()=>{failures=0;if(retry)clearTimeout(retry)}).catch(failed)
  void refresh(selected.current,true).then(result=>{fresh=true;if(result&&!cancelled){selectDraft(result.chat.id);setLoading(false);update()}}).catch(failed).finally(()=>{if(!cancelled)setLoading(false)})
  const timer=setInterval(update,30000);window.addEventListener('focus',update);window.addEventListener('online',update)
  return()=>{cancelled=true;clearInterval(timer);if(retry)clearTimeout(retry);window.removeEventListener('focus',update);window.removeEventListener('online',update)}
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
 async function provisionPinnedChat(row:SubscriptionChat){
  if(row.provider_url)return row
  if((window.plannerNativeChatGPTRelayVersion||0)<8)throw Error('Update the iPhone app to create Main and Tutor connections in Test.')
  const turnId=crypto.randomUUID();let completed=false
  // Reuse the per-chat active-turn lock across devices before creating anything.
  await subscriptionChatRequest(undefined,{action:'tool_begin',chatId:row.id,turnId,prompt:'Connect this Planner chat to its saved ChatGPT Test conversation.'})
  try{
   const found=await nativeRequest<{url:string|null}>({action:'chatGPTRelayFind',account:username,title:row.title})
   let bound=found.url
   if(!bound){
    await nativeRequest({action:'chatGPTRelaySend',account:username,chatId:row.id,text:'Reply only READY. This is a connection check for Planner conversation '+row.id+'. Do not use tools, browse websites, edit data, or start any reviews.',context:'',work:true})
    for(let attempt=0;attempt<240;attempt++){
     await new Promise(resolve=>setTimeout(resolve,500))
     const result=await nativeRequest<{phase:string;url?:string;guest?:boolean;needsLogin?:boolean}>({action:'chatGPTRelayStatus',account:username})
     if(!bound&&result.url&&/^https:\/\/chatgpt\.com\/g\/[^/]+\/c\/[A-Za-z0-9_-]+$/.test(result.url)){await subscriptionChatRequest(undefined,{action:'relay_bind',chatId:row.id,url:result.url});bound=result.url}
     if(result.phase==='completed'){if(!bound)throw Error('ChatGPT did not confirm a saved Test conversation.');break}
     if(result.phase==='attention'||result.phase==='interaction'||result.needsLogin||result.guest)throw Error('Finish the ChatGPT sign-in or pending website approval before syncing chats.')
     if(attempt===239)throw Error('ChatGPT chat setup is still pending. Its existing link was preserved; check the session before retrying.')
    }
   }else await subscriptionChatRequest(undefined,{action:'relay_bind',chatId:row.id,url:bound})
   const current=await subscriptionChatRequest<SubscriptionWorkspace>(row.id,undefined,undefined,true)
   await mirrorChat(current.chat,'planner');completed=true;return current.chat
  }finally{await subscriptionChatRequest(undefined,{action:'tool_finish',chatId:row.id,turnId,cancelled:!completed}).catch(()=>{})}
 }
 async function syncChats(prefer?:'planner'|'chatgpt',background=false,pinnedOnly=false){
  if(!native||busy||mirrorLock.current||(background&&!workspace?.chat.provider_url))return
  mirrorLock.current=true;setSyncing(true);setSyncNotice('Syncing ChatGPT conversations…');setError('')
  try{
   let current=await subscriptionChatRequest<SubscriptionWorkspace>()
   const failures:string[]=[]
   if(!background&&!prefer){for(const row of current.chats.filter(c=>(c.is_main||c.tutor_subject_id)&&!c.archived&&!c.deleted_at&&!c.provider_url)){try{setSyncNotice('Setting up '+row.title+' in ChatGPT Test…');await provisionPinnedChat(row)}catch(e){failures.push(e instanceof Error?e.message:'Chat setup failed')}}current=await subscriptionChatRequest<SubscriptionWorkspace>()}
   const rows=syncConflict&&prefer?[current.chats.find(c=>c.id===syncConflict.chat.id)].filter((c):c is SubscriptionChat=>Boolean(c)):current.chats.filter(c=>Boolean(c.provider_url)&&(!background||c.id===selected.current)&&(!pinnedOnly||c.is_main||Boolean(c.tutor_subject_id)))
   if(!rows.length&&!failures.length){setSyncNotice('Chats appear in ChatGPT history after their first message while signed in.');return}
   for(const row of rows){try{await mirrorChat(row,prefer)}catch(e){failures.push(e instanceof Error?e.message:'Sync failed')}}
   if(failures.length){await refresh();throw Error(`${failures.length} conversation${failures.length===1?'':'s'} could not sync. ${[...new Set(failures)].slice(0,2).join(' ')} Your messages remain saved in Planner.`)}
   setSyncConflict(null);setSyncNotice(pinnedOnly?'Main Chat and Tutor chats are synced in Test.':'ChatGPT conversations synced.');await refresh()
  }catch(e){if(!background)setError(e instanceof Error?e.message:'Could not sync ChatGPT chats.');setSyncNotice('Chat history sync needs attention. You can still send messages; changes remain saved in Planner.')}
  finally{mirrorLock.current=false;setSyncing(false)}
 }
 async function update(chat:SubscriptionChat,patch:Record<string,unknown>){
  if(busy||mirrorLock.current)return
  if(patch.deleted===true&&chat.provider_url&&!window.confirm('Delete this conversation from ChatGPT too? ChatGPT deletion is permanent; only the Planner copy can remain recoverable in Bin.'))return
  setBusy(true);setError('')
  try{const saved=await subscriptionChatRequest<SubscriptionChat>(undefined,{action:'update',id:chat.id,...patch});setRename(null);if(native&&saved.provider_url&&Object.keys(patch).some(k=>['title','archived','deleted'].includes(k))){setSyncing(true);try{await mirrorChat(saved);setSyncNotice('ChatGPT conversation synced.')}finally{setSyncing(false)}}else if(saved.provider_url&&!native){setSyncNotice('Saved in Planner. Open the iPhone app to sync ChatGPT.')}await refresh()}catch(e){setError(e instanceof Error?e.message:'Could not update chat.')}finally{setBusy(false);await refresh().catch(()=>{})}
 }
 async function connect(){setError('');try{if(window.plannerNativeChatGPTPortal){await nativeRequest({action:'chatGPTPortal',account:username,intent:relayReady?'inspect':'connect'});return}await subscriptionChatRequest(undefined,{action:'connect'})}catch(e){setError(e instanceof Error?e.message:'Could not connect ChatGPT.')}}
 async function saveReply(value:Recovery){
  if(savingReply.current)return
  savingReply.current=true
  try{
  while(value.outputs?.length){
   const output=value.outputs[0];setRelayPhase('Downloading '+output.name+'…')
   const file=await nativeRequest<Omit<RelayFile,'id'>>({action:'chatGPTRelayDownload',account:username,key:output.key,url:value.providerUrl,reply:value.reply})
   const bundled=await unpackRelayBundle(file,value.turnId)
   if(bundled){
    const completed=value.bundleProgress?.key===output.key?[...value.bundleProgress.completed]:[]
    for(const child of bundled){
     if(completed.includes(child.transferKey))continue
     const id=await storeRelayFile(value.chatId,child);completed.push(child.transferKey)
     value={...value,reply:value.reply+'\n\n'+relayFileLink(child.name,id),bundleProgress:{key:output.key,completed:[...completed]}}
     setRecovery(value);try{localStorage.setItem(recoveryKey,JSON.stringify(value))}catch{/* Keep the in-memory receipt. */}
    }
   }else{const received={...file,id:crypto.randomUUID()},id=await storeRelayFile(value.chatId,received);value={...value,reply:value.reply+'\n\n'+relayFileLink(received.name,id)}}
   value={...value,outputs:value.outputs!.slice(1),bundleProgress:undefined}
   setRecovery(value);try{localStorage.setItem(recoveryKey,JSON.stringify(value))}catch{/* Keep in-memory recovery. */}
  }
  if(!value.reply.trim())throw Error('No readable response or completed file download was received.')
  if(value.providerUrl)await subscriptionChatRequest(undefined,{action:'relay_bind',chatId:value.chatId,url:value.providerUrl})
  await subscriptionChatRequest(undefined,{action:'relay_save',chatId:value.chatId,turnId:value.turnId,prompt:value.prompt,reply:value.reply})
  if(value.toolTurnId)await subscriptionChatRequest(undefined,{action:'tool_finish',chatId:value.chatId,turnId:value.toolTurnId});toolTurn.current=null
  localStorage.removeItem(recoveryKey);setRecovery(null)
  if(!selected.current||selected.current===value.chatId){
   // Recovery can finish before the workspace has selected its saved draft.
   selectDraft(value.chatId)
   setMessage(current=>!current.trim()||value.prompt===current.trim()||value.prompt.startsWith(current.trim()+'\n\n[')?'':current)
   if(!message.trim()||value.prompt===message.trim()||value.prompt.startsWith(message.trim()+'\n\n['))setAttachments([])
  }
  // Opening ChatGPT menus here steals the composer's keyboard after a reply.
  // The conversation link was already bound at submission; metadata sync is manual.
  await refresh()
  }finally{savingReply.current=false}
 }
 async function send(override?:string,scheduledRunId?:string,displayLabel?:string,resuming?:SubscriptionAttempt){
  if(!native){await connect();return}
  const prompt=resuming?.prompt||override?.trim()||message.trim()||(attachments.length?'Please review the attached files.':''),id=resuming?.chat_id||chatId
  if(!prompt||!id||busy||!resuming&&restoring||sendLock.current||recovery)return
  if(attachments.length&&(window.plannerNativeChatGPTRelayVersion||0)<2){setError('Update the iPhone app to enable file forwarding.');return}
  const submittedDraft=message,clearComposer=!resuming&&!override&&!scheduledRunId
  if(clearComposer)setMessage('')
  followThread.current=true;sendLock.current=true;setBusy(true);setError('');setRelayPrompt(displayLabel||(scheduledRunId?'Scheduled planner review':prompt));setRelayText(resuming?.partial_reply||'');setRelayPhase(resuming?'Restoring reply…':'Connecting…');setInteraction(false);cancelRelay.current=false
  const turnId=resuming?.id||crypto.randomUUID(),scope=epoch.current
  let resumeVerified=false,scheduledCompleted=false,attemptSaved=Boolean(resuming),visibleReply=resuming?.partial_reply||'',failure='',lastSavedPartial='',lastPartialAt=0
  const stamp=new Date().toISOString(),attemptPrompt=displayLabel||(scheduledRunId?'Scheduled planner review':prompt)
  setActiveAttempt(turnId)
  const initialAttempt:SubscriptionAttempt=resuming||{id:turnId,chat_id:id,prompt:attemptPrompt,status:'started',detail:'',partial_reply:'',submitted_at:null,created_at:stamp,updated_at:stamp}
  rememberAttempt(initialAttempt)
  let currentAttempt=initialAttempt
  const record=async(status:'submitted'|'failed'|'interrupted',detail='')=>{currentAttempt={...currentAttempt,status,detail,partial_reply:visibleReply,submitted_at:currentAttempt.submitted_at||(status==='submitted'?new Date().toISOString():null),updated_at:new Date().toISOString()};rememberAttempt(currentAttempt);try{const attempt=await subscriptionChatRequest<SubscriptionAttempt>(undefined,{action:'relay_attempt_update',chatId:id,turnId,status,detail:detail.slice(0,1000),partialReply:visibleReply.slice(0,80000)});currentAttempt=attempt;rememberAttempt(attempt)}catch{setSyncNotice('Request status could not sync. Check ChatGPT before retrying.')}}
  const toolsEnabled=(window.plannerNativeChatGPTRelayVersion||0)>=4
  let savedPrompt=prompt,submitted:{url?:string|null},submittedURL=workspace?.chat.provider_url
  try{
   if(resuming){
    try{const saved=JSON.parse(localStorage.getItem(activeRequestKey)||'null');if(saved?.turnId===turnId&&saved.chatId===id&&typeof saved.prompt==='string')savedPrompt=saved.prompt}catch{/* Use the durable server receipt. */}
    try{submitted=await nativeRequest({action:'chatGPTRelayResume',account:username,chatId:id,turnId,url:submittedURL})}catch(error){throw Error('A previous Planner tool turn is active. Could not restore its existing reply. Review ChatGPT before stopping or retrying. '+(error instanceof Error?error.message:''))}
    resumeVerified=true
    if(toolsEnabled)toolTurn.current={chatId:id,turnId}
   }else{
   currentAttempt=await subscriptionChatRequest<SubscriptionAttempt>(undefined,{action:'relay_attempt_start',chatId:id,turnId,prompt:attemptPrompt});rememberAttempt(currentAttempt);attemptSaved=true
   const inputLinks:string[]=[]
   for(const file of attachments){setRelayPhase('Uploading '+file.name+'…');inputLinks.push(relayFileLink(file.name,await storeRelayFile(id,file)))}
   savedPrompt=prompt+(inputLinks.length?'\n\n'+inputLinks.join('\n'):'')
   let relayMessage=prompt
   if(toolsEnabled){
    toolTurn.current={chatId:id,turnId}
    const setup=await subscriptionChatRequest<{instructions:string}>(undefined,{action:'tool_begin',chatId:id,turnId,prompt})
    relayMessage=toolTurnMessage(prompt,turnId,setup.instructions)
   }
   setRelayPhase('Sending to ChatGPT…')
   const sendPayload={action:'chatGPTRelaySend',account:username,chatId:id,turnId,text:relayMessage,work:toolsEnabled,url:workspace?.chat.provider_url,files:attachments.map(({name,mime,size,data})=>({name,mime,size,data}))}
   try{localStorage.setItem(activeRequestKey,JSON.stringify({turnId,chatId:id,prompt:savedPrompt}))}catch{/* Server receipt and native ticket remain available. */}
   try{submitted=await nativeRequest(sendPayload)}catch(error){
    if(!/unsent draft/i.test(error instanceof Error?error.message:''))throw error
    const draft=await nativeRequest<{text:string;manual?:boolean}>({action:'chatGPTRelayDraft',account:username})
    const prior=draft.manual?null:unsentRelayRequest(draft.text)
    if(!prior||prior.turnId===turnId)throw error
    const check=await subscriptionChatRequest<{safeToClear:boolean}>(undefined,{action:'relay_draft_check',chatId:id,...prior})
    if(!check.safeToClear)throw error
    await nativeRequest({action:'chatGPTRelayClearDraft',account:username,expected:draft.text})
    if(cancelRelay.current)throw error
    submitted=await nativeRequest(sendPayload)
   }
   }
   await record('submitted',resuming?'Restoring reply…':'Thinking…')
   if(submitted.url&&/^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]+$/.test(submitted.url)&&submitted.url!==submittedURL){await subscriptionChatRequest(undefined,{action:'relay_bind',chatId:id,url:submitted.url});submittedURL=submitted.url;setWorkspace(current=>current?{...current,chat:{...current.chat,provider_url:submitted.url},chats:current.chats.map(chat=>chat.id===id?{...chat,provider_url:submitted.url}:chat)}:current)}
   setRelayPhase('Thinking…')
   let toolRounds=0,boundURL=submittedURL,signInShown=false
   while(!cancelRelay.current&&alive.current&&scope===epoch.current){
    await new Promise(resolve=>setTimeout(resolve,500))
    const result=await nativeRequest<{phase:string;text?:string;message?:string;needsLogin?:boolean;interaction?:boolean;url?:string;files?:{key:string;name:string}[]}>({action:'chatGPTRelayStatus',account:username})
    if(scope!==epoch.current||!alive.current)return
    if(cancelRelay.current)break
    if(result.phase==='idle'&&!result.needsLogin)throw Error('The reply is no longer active. No final reply was saved; check the ChatGPT session before retrying.')
    if(result.url&&/^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]+$/.test(result.url)&&result.url!==boundURL){await subscriptionChatRequest(undefined,{action:'relay_bind',chatId:id,url:result.url});boundURL=result.url}
    if(typeof result.text==='string'&&['working','completed'].includes(result.phase)){visibleReply=toolsEnabled?relayVisible(result.text):result.text;setRelayText(visibleReply)}
    if(result.phase==='working'){
     setRelayPhase(visibleReply?'Responding…':'Thinking…')
     if(visibleReply!==lastSavedPartial&&Date.now()-lastPartialAt>=2500){lastSavedPartial=visibleReply;lastPartialAt=Date.now();await record('submitted',visibleReply?'Responding…':'Thinking…')}
    }
    setInteraction(result.phase==='interaction');if(result.phase==='interaction'){const duo=isDuoVerification([result.text,result.message,visibleReply].filter(Boolean).join(' '));setRelayPhase(duo?'Approve the sign-in in Duo Mobile.':'Website sign-in or approval needed.');if(!duo&&!signInShown&&(window.plannerNativeChatGPTRelayVersion||0)>=5){signInShown=true;await nativeRequest({action:'chatGPTSiteSignIn',account:username,intent:'interaction'})}continue}signInShown=false
    if(result.phase==='completed'){
     const calls=toolsEnabled?relayCalls(result.text||'',turnId):null
     if(calls){
      if(++toolRounds>60)throw Error('This request reached 60 tool rounds. Review the saved changes before continuing.')
      setRelayText('');setRelayPhase('Using Planner tools…')
      const applied=await subscriptionChatRequest<{results:unknown[]}>(undefined,{action:'tool_call',chatId:id,turnId,calls})
      if(cancelRelay.current||scope!==epoch.current||!alive.current)return
      invalidateFilesCache();window.dispatchEvent(new Event('planner-files-refresh'));window.dispatchEvent(new Event('planner-calendar-refresh'));window.dispatchEvent(new Event('planner-preferences-refresh'))
      const executed=calls.some(call=>call.name==='planner_client_control')?await (await import('../lib/clientControls')).executeClientResults(applied.results,calls,username,turnId,()=>!cancelRelay.current&&scope===epoch.current&&alive.current):applied.results
      if(cancelRelay.current||scope!==epoch.current||!alive.current)return
      await nativeRequest({action:'chatGPTRelaySend',account:username,chatId:id,turnId,text:toolResultsMessage(executed,turnId),work:true,url:result.url,context:''})
      setRelayPhase('Working… Keep Planner open.');continue
     }
     const value:Recovery={chatId:id,turnId,prompt:displayLabel||(scheduledRunId?'Scheduled planner review':savedPrompt),reply:toolsEnabled?relayVisible(result.text||''):result.text||'',toolTurnId:toolsEnabled?turnId:undefined,outputs:result.files||[],providerUrl:result.url&&/^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]+$/.test(result.url)?result.url:undefined}
     setRecovery(value);try{localStorage.setItem(recoveryKey,JSON.stringify(value))}catch{setError('Reply received. Keep this page open until it is saved.')}
     setRelayPhase('Saving reply…');await saveReply(value);scheduledCompleted=true;setMessage('');setRelayPrompt('');setRelayText('');setAttachments([]);return
    }
    if(result.phase==='attention'||result.needsLogin)throw new Error(result.message||'ChatGPT needs attention. Open its session; do not resend until you check it.')
   }
  }catch(e){failure=e instanceof Error?e.message:'Relay failed. Open the session before retrying.';setError(attemptSaved&&!/website sign-in|unsent draft|previous Planner tool turn/i.test(failure)?'':failure)}finally{
   if(!alive.current||scope!==epoch.current){sendLock.current=false;return}
   const preserveForRestore=Boolean(resuming&&!resumeVerified&&failure)
   if(!preserveForRestore){try{const saved=JSON.parse(localStorage.getItem(activeRequestKey)||'null');if(saved?.turnId===turnId)localStorage.removeItem(activeRequestKey)}catch{}}
   if(!scheduledCompleted){
    if(clearComposer)setMessage(current=>current||submittedDraft)
    const detail=failure||'Request interrupted before a final reply was saved.'
    if(attemptSaved)await record(preserveForRestore?'submitted':cancelRelay.current?'interrupted':'failed',detail)
    else rememberAttempt({...initialAttempt,status:'failed',detail:'Could not save the request receipt. Your draft was kept.'})
   }
   setActiveAttempt(null)
   if(scheduledRunId)void subscriptionChatRequest(undefined,{action:'schedule_finish',runId:scheduledRunId,completed:scheduledCompleted}).catch(()=>setScheduleError('Review status could not save. Check the last Chat reply before retrying.'))
   if(toolTurn.current){const pending=toolTurn.current;void subscriptionChatRequest(undefined,{action:'tool_finish',...pending,cancelled:true}).catch(()=>{});toolTurn.current=null}
   sendLock.current=false;setBusy(false);setInteraction(false);setRelayPhase('');setRelayPrompt('');setRelayText('')
  }
 }
 useEffect(()=>{
  if(!active||!native||(window.plannerNativeChatGPTRelayVersion||0)<9||!relayReady||busy||sendLock.current||recovery||!workspace)return
  const latestSaved=workspace.messages.reduce((latest,item)=>Math.max(latest,Date.parse(item.created_at)),0)
  const candidate=(workspace.attempts||[]).filter(item=>(['started','submitted'].includes(item.status)||item.status==='failed'&&item.detail.startsWith('A previous Planner tool turn is active. Could not restore its existing reply.'))&&Date.parse(item.created_at)>=latestSaved).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
  if(!candidate||restoreAttempted.current.has(candidate.id))return
  restoreAttempted.current.add(candidate.id)
  const generation=epoch.current
  setRestoring(true)
  void subscriptionChatRequest<{canResume:boolean}>(undefined,{action:'relay_resume_check',chatId:candidate.chat_id,turnId:candidate.id}).then(check=>{if(check.canResume&&alive.current&&generation===epoch.current){if(!sendLock.current)void send(undefined,undefined,undefined,candidate);else restoreAttempted.current.delete(candidate.id)}}).catch(()=>{restoreAttempted.current.delete(candidate.id);if(alive.current)setSyncNotice('The previous reply could not be checked. Review the session before retrying.')}).finally(()=>{if(alive.current&&generation===epoch.current)setRestoring(false)})
 },[active,native,relayReady,busy,recovery,workspace?.chat.id,workspace?.attempts,workspace?.messages])
 async function stop(){cancelRelay.current=true;if(toolTurn.current)void subscriptionChatRequest(undefined,{action:'tool_finish',...toolTurn.current,cancelled:true}).catch(()=>{});try{await nativeRequest({action:'chatGPTRelayStop',account:username});setRelayPhase('Stopping…')}catch(e){setError(e instanceof Error?e.message:'Open the session to stop this response.')}}
 async function continueInChatGPT(){if(interaction&&(window.plannerNativeChatGPTRelayVersion||0)<5){setError('Update the iPhone app to sign in to websites inside Planner.');return}try{await nativeRequest({action:interaction?'chatGPTSiteSignIn':'chatGPTPortal',account:username,intent:interaction?'interaction':'inspect'})}catch(e){setError(e instanceof Error?e.message:'Could not open the secure session.')}}
 async function cancelUnfinished(){if(!chatId)return;try{await subscriptionChatRequest(undefined,{action:'tool_cancel_active',chatId});setError('');setSyncNotice('Stopped future tool execution. Read current app state before repeating earlier changes.')}catch(e){setError(e instanceof Error?e.message:'Could not stop unfinished request.')}}
 async function inspectRemoteDraft(){try{const result=await nativeRequest<{text:string}>({action:'chatGPTRelayDraft',account:username});setRemoteDraft(result.text)}catch(e){setError(e instanceof Error?e.message:'Could not inspect draft.')}}
 async function clearRemoteDraft(){if(remoteDraft===null)return;try{await nativeRequest({action:'chatGPTRelayClearDraft',account:username,expected:remoteDraft});setRemoteDraft(null);setError('')}catch(e){setError(e instanceof Error?e.message:'Could not clear draft.')}}
 async function addFiles(files:File[]){
  if(preparing)return
  const scope=epoch.current;setPreparing(true);setError('')
  try{let next=[...attachments];for(const file of files){const item=await prepareRelayFile(file);if(next.length>=4||next.reduce((sum,a)=>sum+a.size,0)+item.size>RELAY_BATCH_MAX)throw new Error('Attach up to four files, 25 MB each and 50 MB total.');next.push(item)}if(scope===epoch.current)setAttachments(next)}catch(e){setError(e instanceof Error?e.message:'Could not prepare attachments.')}finally{setPreparing(false)}
 }
 useEffect(()=>{if(!active)return;let stopped=false;void subscriptionChatRequest<any>(undefined,{action:'schedule_read'}).then(value=>{if(!stopped)setSchedulePrefs(value)}).catch(e=>{if(!stopped)setScheduleError(e.message)});return()=>{stopped=true}},[active,username])
 async function changeSchedule(enabled:boolean){if(!schedulePrefs||scheduleSaving)return;setScheduleSaving(true);try{const value=await subscriptionChatRequest<any>(undefined,{action:'schedule_update',expectedUpdatedAt:schedulePrefs.updatedAt,enabled,...(enabled?{signInsReady:true}:{})});setSchedulePrefs(value);setScheduleError('')}catch(e){setScheduleError(e instanceof Error?e.message:'Could not save Chat schedule.')}finally{setScheduleSaving(false)}}
 useEffect(()=>{
  if(!active||!native||!relayReady||busy||restoring||syncing||recovery||message.trim()||attachments.length||!schedulePrefs?.enabled||!workspace?.chat.is_main)return
  let stopped=false
  const poll=async()=>{if(stopped||scheduleLock.current||document.visibilityState==='hidden')return;scheduleLock.current=true;try{const due=await subscriptionChatRequest<{due:boolean;runId?:string;prompt?:string;label?:string}>(undefined,{action:'schedule_claim',chatId:workspace.chat.id,ready:true});if(due.due&&due.runId&&due.prompt){if(stopped){await subscriptionChatRequest(undefined,{action:'schedule_finish',runId:due.runId,completed:false});return}await send(due.prompt,due.runId,due.label)}}catch(e){if(!stopped)setScheduleError(e instanceof Error?e.message:'Scheduled review needs attention.')}finally{scheduleLock.current=false}}
  void poll();const timer=setInterval(()=>void poll(),30000);return()=>{stopped=true;clearInterval(timer)}
 },[active,native,relayReady,busy,restoring,syncing,recovery,message,attachments.length,schedulePrefs?.enabled,workspace?.chat.id])
 const messageIds=new Set(workspace?.messages.map(item=>item.id)||[])
 const timeline=[...(workspace?.messages||[]).map(message=>({id:message.id,created_at:message.created_at,message,attempt:undefined as SubscriptionAttempt|undefined})),...(workspace?.attempts||[]).filter(attempt=>attempt.status!=='completed'&&!messageIds.has(attempt.id)).map(attempt=>({id:attempt.id,created_at:attempt.created_at,message:undefined,attempt}))].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))
 const backgroundIds=whoopBackgroundIds(workspace?.messages||[])
 const isBackground=(entry:typeof timeline[number])=>entry.attempt?isWhoopBackground(entry.attempt.prompt):backgroundIds.has(entry.id)
 const backgroundTimeline=timeline.filter(isBackground),foregroundTimeline=timeline.filter(entry=>!isBackground(entry))
 const renderTurn=(entry:typeof timeline[number])=>entry.attempt?<ChatAttempt key={entry.id} attempt={entry.attempt} live={activeAttempt===entry.id?{text:relayText,phase:relayPhase,interaction,onStop:()=>void stop()}:undefined} disabled={busy||syncing} onReview={()=>void continueInChatGPT()}/>:((item)=><article className="assistant-turn" key={item.id}><div className={item.role==='user'?'assistant-user-message':'assistant-reply'} role="group" aria-label={item.role==='user'?'Your message':'Assistant message'} onClickCapture={event=>{const link=(event.target as Element).closest('a');const id=link?.getAttribute('href')?.match(/^#planner-chat-file\/([a-f0-9-]{36})$/i)?.[1];if(id){event.preventDefault();event.stopPropagation();setPreviewFile(id)}}}><ChatMarkdown text={item.content}/><time hidden className="assistant-message-time" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time><button type="button" className="assistant-copy" aria-label="Copy message" title="Copy message" onClick={()=>void navigator.clipboard.writeText(item.content).catch(()=>setError('Could not copy this message.'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg></button></div></article>)(entry.message!)
 const chat=workspace?.chats.find(c=>c.id===chatId)||workspace?.chat
 const visible=workspace?.chats.filter(c=>filter==='bin'?Boolean(c.deleted_at):!c.deleted_at&&Boolean(c.archived)===(filter==='archived'))||[]
 const renderChat=(row:SubscriptionChat)=><div className="assistant-chat-row" key={row.id}><button type="button" title={row.title} aria-current={row.id===chatId?'page':undefined} disabled={busy||syncing} onClick={()=>void choose(row)}>{(row.is_main||row.pinned)&&<span title={row.is_main?'Permanently pinned':'Pinned'} style={{marginRight:6}}>📌 </span>}{row.title}</button>{!row.is_main&&<details className="assistant-chat-options"><summary aria-label={'Options for '+row.title}>⋯</summary><div>{row.deleted_at?<button disabled={busy||syncing} onClick={()=>void update(row,{deleted:false})}>Restore chat</button>:<><button disabled={busy||syncing||row.is_main} onClick={()=>void update(row,{pinned:!row.pinned})}>{row.pinned?'Unpin chat':'Pin chat'}</button><button disabled={busy||syncing} onClick={()=>setRename(row)}>Rename chat</button><button disabled={busy||syncing} onClick={()=>void update(row,{archived:!row.archived})}>{row.archived?'Restore chat':'Archive chat'}</button><button disabled={busy||syncing} onClick={()=>void update(row,{deleted:true})}>Move to bin</button></>}</div></details>}</div>
 return <main className={'assistant-app'+(sidebar?' sidebar-open':'')} aria-label="Subscription Chat">{previewFile&&<ChatFilePreview key={username+':'+previewFile} id={previewFile} onClose={()=>setPreviewFile(null)}/>}
 {sidebar&&<aside className="assistant-sidebar" aria-label="Chat sidebar" inert={Boolean(panel||rename||previewFile)}><div className="assistant-sidebar-top"><strong>Your chats</strong><button type="button" className="icon-btn" aria-label="Hide chat sidebar" onClick={()=>setSidebar(false)}><CloseIcon size={18}/></button></div>
 <button type="button" className="assistant-new-chat" disabled={busy||syncing} onClick={()=>void create()}><PlusIcon size={18}/>New chat</button>
 <SourceConnectionAlerts username={username} active={active} refreshKey={JSON.stringify(workspace?.google)} onManage={()=>setPanel('connections')}/>
 <button type="button" className="assistant-archive-toggle" onClick={()=>setFilter(filter==='archived'?'active':'archived')}>{filter==='archived'?'Back to chats':'Archived chats'}</button><button type="button" className="assistant-archive-toggle" onClick={()=>setFilter(filter==='bin'?'active':'bin')}>{filter==='bin'?'Back to chats':'Bin'}</button>
 <nav aria-label="Conversations" className="assistant-conversations">{visible.filter(row=>row.is_main).map(renderChat)}
 <section className="assistant-tutor-folder" aria-label="Tutor folder"><div className="assistant-tutor-heading"><button type="button" aria-expanded={tutorOpen} aria-controls="subscription-tutor-subjects" aria-label="Tutor" onClick={()=>setTutorOpen(value=>!value)}><span aria-hidden="true">{tutorOpen?'▾':'▸'} 📌 📁</span> Tutor</button><button type="button" aria-label="Refresh Tutor subjects" disabled={busy||syncing} onClick={()=>void subscriptionChatRequest(undefined,{action:'tutor_sync'}).then(()=>refresh()).catch(e=>setError(e.message))}>↻</button></div>{tutorOpen&&<div id="subscription-tutor-subjects" role="group" aria-label="Tutor subjects" className="assistant-tutor-subjects">{visible.filter(row=>row.tutor_subject_id).map(renderChat)}</div>}</section>
 {visible.filter(row=>!row.is_main&&!row.tutor_subject_id).map(renderChat)}</nav>
 <button type="button" className="assistant-archive-toggle" disabled={busy||syncing||!native} onClick={()=>void syncChats()}>Sync ChatGPT chats</button>
 <button type="button" className="assistant-sidebar-settings" onClick={()=>setPanel('settings')}><SettingsIcon size={18}/>Settings</button>
</aside>}
 {sidebar&&<button type="button" className="assistant-sidebar-scrim" aria-label="Close chat sidebar" onClick={()=>setSidebar(false)}/>}
 <section className="assistant-chat" aria-label="Subscription conversation" inert={Boolean(panel||rename||previewFile)}><header className="assistant-chat-header"><div>{!sidebar&&<button type="button" className="icon-btn" aria-label="Show chat sidebar" onClick={()=>setSidebar(true)}><MenuIcon/></button>}<button type="button" className="icon-btn" aria-label="New chat" disabled={busy||syncing} onClick={()=>void create()}><PlusIcon/></button><div className="assistant-chat-title"><strong>{chat?.title||'Main Chat'}</strong><span>ChatGPT subscription</span><span role="status">{window.plannerNativeChatGPTPortal?signedIn?'Connected':relayReady?'Guest session':sessionState==='checking'?'Restoring session…':'Connect ChatGPT':'Not connected'}</span></div></div><div>{native&&<button type="button" className="assistant-sites-button" onClick={()=>void connect()}>ChatGPT session</button>}<button type="button" className="assistant-sites-button" onClick={()=>setPanel('connections')}>Add sites</button><button type="button" className="icon-btn" aria-label="Chat settings" onClick={()=>setPanel('settings')}><SettingsIcon/></button></div></header>
 {connectionIssue&&<p role="status" className="chat-connection-notice">Connection interrupted. Reconnecting… <button type="button" className="text-btn" onClick={()=>void refresh().catch(e=>{if(!chatConnectionError(e))setError(e.message)})}>Retry connection</button></p>}
 {error&&<p role="alert" className="assistant-error">{error}{native&&/Could not restore its existing reply/i.test(error)&&<button type="button" disabled={busy} onClick={()=>{restoreAttempted.current.clear();void refresh().catch(e=>setError(e.message))}}>Restore reply</button>}{native&&/previous Planner tool turn/i.test(error)&&<button type="button" onClick={()=>void cancelUnfinished()}>Stop unfinished request</button>}{native&&/website sign-in is pending/i.test(error)&&<button type="button" disabled={busy||syncing} onClick={()=>void nativeRequest({action:'chatGPTSiteSignIn',account:username,intent:'interaction'}).catch(e=>setError(e instanceof Error?e.message:'Could not open website sign-in.'))}>Finish website sign-in</button>}{native&&/unsent draft/i.test(error)&&<button type="button" disabled={busy||syncing} onClick={()=>void inspectRemoteDraft()}>Review ChatGPT draft</button>}<button type="button" className="icon-btn" aria-label="Dismiss chat error" onClick={()=>setError('')}>×</button></p>}
 {(chat?.archived||chat?.deleted_at)&&<p className="agent-banner">This chat is {chat.deleted_at?'in Bin':'archived'}. Restore it from the sidebar to continue.</p>}
 <div ref={thread} className="assistant-thread" onScroll={e=>{const element=e.currentTarget;followThread.current=element.scrollHeight-element.clientHeight-element.scrollTop<80}}><div className="assistant-thread-content">{workspace?.hasOlder&&<button type="button" disabled={older} onClick={()=>{const first=workspace.messages[0];if(!first)return;followThread.current=false;setOlder(true);void subscriptionChatRequest<SubscriptionWorkspace>(chatId||undefined,undefined,first.id).then(result=>setWorkspace(current=>current?.chat.id===result.chat.id?{...current,hasOlder:result.hasOlder,messages:[...result.messages,...current.messages.filter(item=>!result.messages.some(older=>older.id===item.id))]}:current)).catch(e=>setError(e.message)).finally(()=>setOlder(false))}}>Load earlier messages</button>}
 {!timeline.length&&!relayPrompt&&!recovery&&<div className="assistant-welcome"><span className="assistant-spark">✦</span><h1>{loading||sessionState==='checking'&&!signedIn?'Opening your chat…':'What can I help with?'}</h1><p>Plan your day, work with your files, and keep your tasks organized.</p>{sessionState==='checking'&&!signedIn&&<div className="chat-session-loading" role="status" aria-label="Restoring ChatGPT session"><span/><span/><span/></div>}{sessionState==='unavailable'&&!signedIn&&<button type="button" onClick={()=>void connect()}>Check ChatGPT session</button>}{!signedIn&&sessionState==='signed-out'&&<><button type="button" className="assistant-primary" onClick={()=>{if(!window.plannerNativeChatGPTPortal)setPanel('settings');void connect()}}>{window.plannerNativeChatGPTPortal?'Connect ChatGPT session':'Connect ChatGPT'}</button><p className="quiet">{window.plannerNativeChatGPTPortal?'Load the session once, then send messages here. You can test basic chat as a guest. Keep Planner open while working.':'Subscription connection setup is still required. Your drafts stay saved here.'}</p></>}</div>}
 {backgroundTimeline.length>0&&<details className="whoop-background-check"><summary>WHOOP background updates · {backgroundTimeline.filter(entry=>entry.attempt||entry.message?.role==='user').length}{backgroundTimeline.some(entry=>entry.attempt?.status==='failed'||entry.attempt?.status==='interrupted')?' · Needs attention':backgroundTimeline.some(entry=>entry.attempt)?' · Reviewing…':''}</summary>{backgroundTimeline.map(renderTurn)}</details>}{foregroundTimeline.map(renderTurn)}{recovery&&<p role="alert">A reply was received. File transfer or cloud saving still needs to finish. <button type="button" disabled={busy||syncing} onClick={()=>{setBusy(true);void saveReply(recovery).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>{recovery.outputs?.length?'Retry file transfer':'Save reply'}</button>{Boolean(recovery.outputs?.length)&&recovery.reply.trim()&&<button type="button" disabled={busy||syncing} onClick={()=>{setBusy(true);void saveReply({...recovery,outputs:[]}).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>Save reply without files</button>}</p>}</div></div>
 {native&&<div className="chat-connection-notice"><button type="button" className="text-btn" onClick={()=>void nativeRequest({action:'chatGPTSiteSignIn',account:username,chatId:workspace?.chat.id,url:workspace?.chat.provider_url,intent:'interaction'}).catch(e=>setError(e instanceof Error?e.message:'Could not open the web view.'))}>Open web view</button></div>}
 <div className="assistant-compose-wrap"><form className="assistant-compose subscription-compose" onSubmit={e=>{e.preventDefault();void send()}}>{Boolean(attachments.length)&&<div className="chat-attachment-list">{attachments.map(file=><div className="chat-attachment" key={file.id}><span>{file.name} · {(file.size/1024).toFixed(0)} KB</span><button type="button" disabled={busy||syncing} aria-label={'Remove attachment '+file.name} onClick={()=>setAttachments(items=>items.filter(item=>item.id!==file.id))}>×</button></div>)}</div>}<label className="sr-only" htmlFor="subscription-message">Message ChatGPT</label><textarea ref={composerInput} id="subscription-message" disabled={busy||restoring||syncing||Boolean(chat?.archived||chat?.deleted_at)} rows={1} maxLength={10000} placeholder="Ask anything…" value={message} onChange={e=>setMessage(e.target.value)} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void addFiles(Array.from(e.clipboardData.files))}}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div className="assistant-compose-toolbar"><div className="compose-left-actions"><AttachButton accept="*/*" description="Original files: up to four, 25 MB each and 50 MB total. ChatGPT may reject unsupported formats." disabled={preparing||busy||restoring||syncing} onFiles={files=>void addFiles(files)}/><button type="button" className="assistant-compose-connect" aria-label="Add sites" title="Add sites" onClick={()=>setPanel('connections')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg></button></div><div className="assistant-compose-actions"><DictationButton key={chatId||'subscription-new'} enabled={active&&!preparing&&!busy&&!restoring&&!syncing&&!loading&&Boolean(chat)&&!chat?.archived&&!chat?.deleted_at} onBusy={setDictating} onText={text=>setMessage(old=>(old+(old?' ':'')+text).slice(0,10000))}/><button type="submit" className="assistant-send" aria-label="Send message" title={native?'Send through your ChatGPT website session':'ChatGPT subscription setup is required'} disabled={!native||!relayReady||!chat||loading||busy||restoring||syncing||(!message.trim()&&!attachments.length)||Boolean(recovery)}>↑</button></div></div></form><p className={'assistant-compose-note'+(activeAttempt||!(syncing||relayPhase||syncNotice||preparing||dictating)?' is-idle':'')}>{activeAttempt?'':syncing?'Syncing ChatGPT conversations…':relayPhase||syncNotice|| (preparing?'Preparing files…':dictating?'Listening…':window.plannerNativeChatGPTPortal?'Uses your ChatGPT website session. Keep Planner open while working.':'Connect your ChatGPT subscription to send messages. Shift+Enter for a new line.')}</p></div>
 </section>
 {panel&&<div className="modal-backdrop" onMouseDown={()=>setPanel(null)}><section role="dialog" aria-modal="true" aria-label={panel==='settings'?'Chat settings':'Chat connected sites'} className="event-modal device-settings" onMouseDown={e=>e.stopPropagation()}><div className="files-dialog-head"><h2>{panel==='settings'?'Chat settings':'Connected sites'}</h2><button type="button" className="icon-btn" aria-label="Close chat settings" onClick={()=>setPanel(null)}><CloseIcon/></button></div>{error&&<p role="alert" className="form-error">{error}</p>}{panel==='settings'&&<section className="assistant-settings-section"><h3>Scheduled reviews</h3><p>For reviews while Planner is closed, connect Planner as an authenticated app in ChatGPT using <code>https://aiplanner-ten.vercel.app/api/mcp</code>, signed in as this test account. Cloud scheduling must be created and verified in ChatGPT; the local relay alone cannot perform unattended tool calls.</p><button type="button" disabled={busy||!relayReady} onClick={()=>void subscriptionChatRequest<{prompt:string}>(undefined,{action:'schedule_prepare_cloud'}).then(value=>{setPanel(null);return send(value.prompt,undefined,'Set up ChatGPT cloud reviews')}).catch(e=>setScheduleError(e.message))}>Set up ChatGPT cloud reviews after sign-in</button><h4>Foreground relay testing</h4><p>{schedulePrefs?.schedule.times.join(', ')||'07:00, 17:00'} · New York time</p><p>Keep Planner open on Main Chat with ChatGPT signed in. Reviews do not run while the app is closed. Finish signing into your sources before enabling.</p><label><input type="checkbox" checked={schedulePrefs?.enabled===true} disabled={!schedulePrefs||scheduleSaving||busy||!relayReady} onChange={e=>void changeSchedule(e.target.checked)}/>My sign-ins are ready; enable Chat scheduled reviews</label>{scheduleError&&<p role="alert">{scheduleError}</p>}</section>}{panel==='settings'&&(<section className="assistant-settings-section"><h3>ChatGPT subscription</h3>{signedIn?<><p role="status">Connected</p><button type="button" onClick={()=>void connect()}>Manage session</button></>:<><p>{window.plannerNativeChatGPTPortal?'Load or sign in to the ChatGPT session, then return to Planner. Text messages and replies are forwarded through that session. Saved conversations can sync names and archive state after signing in. Empty chats appear in ChatGPT history after the first message. Planner calendar, Files, settings, memory and authorized Google tools are connected in updated iPhone builds. ChatGPT uses its own cloud browser; secure sign-in and approvals open in Planner’s Connect website sheet. Keep Planner open; unattended runs remain separate.':'Subscription sign-in is not configured for Planner yet. Chats and drafts are saved separately from Agent.'}</p><button type="button" onClick={()=>void connect()}>{window.plannerNativeChatGPTPortal?'Connect ChatGPT session':'Connect ChatGPT'}</button>{!native&&<p><a href="https://developers.openai.com/siwc/request-client-id" target="_blank" rel="noreferrer">Subscription connection requirements</a></p>}</>}<p>Website access uses your ChatGPT cloud browser and its own saved sessions. Existing Agent scheduled runs remain separate.</p></section>)}{panel==='settings'?<><p className="quiet">These personal instructions are shared across your Planner agents.</p><AgentInstructions/></>:<><ConnectedApps signedIn={signedIn} checking={sessionState==='checking'} native={native} google={workspace?.google} refresh={async()=>{await refresh()}} onSession={()=>void connect()} onSource={source=>{setPanel(null);void send(`Open ${VM_SOURCES[source].url} in your cloud browser and help me sign in. Use the private secure sign-in form for credentials and approvals. Verify that you can read the relevant inbox or messages afterward. Use messages only as information for calendar planning; do not send messages, post, or change anything in the connected app. After verifying access, use Planner tools to enable this source for planning while preserving the other enabled sources, and save its verified access details in planning memory. Do not claim it is connected if reading was not verified.`)}}/></>}</section></div>}
 {remoteDraft!==null&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="ChatGPT unsent draft" className="event-modal"><h2>ChatGPT unsent draft</h2><p>This text is still in the website’s composer. Your Planner draft stays unchanged.</p><pre style={{whiteSpace:'pre-wrap',maxHeight:'40vh',overflow:'auto'}}>{remoteDraft||'(empty)'}</pre><button type="button" onClick={()=>setRemoteDraft(null)}>Keep draft</button><button type="button" onClick={()=>void clearRemoteDraft()}>Clear ChatGPT draft</button></section></div>}
 {syncConflict&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Chat sync conflict" className="event-modal"><h2>Choose the chat version</h2><p>Planner: {syncConflict.chat.title}</p><p>ChatGPT: {syncConflict.remote.title}</p><p>Both changed since the last sync. Choose which version to keep for the conflicting fields.</p><button disabled={syncing} onClick={()=>void syncChats('planner')}>Keep Planner changes</button><button disabled={syncing} onClick={()=>void syncChats('chatgpt')}>Keep ChatGPT changes</button><button disabled={syncing} onClick={()=>setSyncConflict(null)}>Later</button></section></div>}
 {rename&&<RenameDialog initialValue={rename.title} kind="chat" busy={busy} error={error} onClose={()=>setRename(null)} onSave={title=>update(rename,{title})}/>}
 </main>
}
