import {useEffect,useRef,useState} from 'react'
import {SubscriptionChatView} from './SubscriptionChatView'
import {subscriptionChatRequest} from '../lib/api'
import type {SubscriptionWorkspace} from '../lib/subscriptionChat'
import {ChatAttempt} from './ChatAttempt'
import {ChatMarkdown} from './ChatMarkdown'
import {CloseIcon,WindIcon} from './Icons'
export function MainChatBubble({username,open,onOpenChange}:{username:string;open:boolean;onOpenChange:(open:boolean)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),launcher=useRef<HTMLButtonElement>(null)
 const [visited,setVisited]=useState(false),[workspace,setWorkspace]=useState<SubscriptionWorkspace|null>(null),[error,setError]=useState('')
 const native=Boolean(window.plannerNativeChatGPTPortal)
 useEffect(()=>{if(open){setVisited(true);dialog.current?.showModal()}else if(dialog.current?.open){dialog.current.close();launcher.current?.focus()}},[open])
 useEffect(()=>{if(!open||native)return;let stopped=false;setError('');void subscriptionChatRequest(undefined,undefined,undefined,true).then(result=>{if(!stopped)setWorkspace(result)}).catch(error=>{if(!stopped)setError(error.message)});return()=>{stopped=true}},[open,native,username])
 const messageIds=new Set(workspace?.messages.map(item=>item.id)||[])
 const history=[...(workspace?.messages||[]).map(message=>({id:message.id,time:message.created_at,message,attempt:undefined})),...(workspace?.attempts||[]).filter(attempt=>attempt.status!=='completed'&&!messageIds.has(attempt.id)).map(attempt=>({id:attempt.id,time:attempt.created_at,message:undefined,attempt}))].sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id))
 return <><button ref={launcher} type="button" className="main-ai-bubble" aria-label="Open Main Chat" aria-haspopup="dialog" aria-expanded={open} onClick={()=>onOpenChange(true)}><WindIcon size={32}/></button>
 <dialog ref={dialog} className="main-ai-sheet" aria-label="Main Chat" onCancel={event=>{event.preventDefault();onOpenChange(false)}} onClick={event=>{if(event.target===dialog.current){const rect=dialog.current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onOpenChange(false)}}}>
 <div className="main-ai-sheet-top"><span className="main-ai-handle" aria-hidden="true"/><div><span className="main-ai-identity"><span aria-hidden="true"><WindIcon size={24}/></span> Main Chat</span><button type="button" className="icon-btn" aria-label="Close Main Chat" onClick={()=>onOpenChange(false)}><CloseIcon/></button></div></div>
 {native&&visited?<SubscriptionChatView username={username} active={open} sidebar={false} setSidebar={()=>{}}/>:<section className="main-ai-web-chat"><div className="main-ai-web-messages">{error&&<p role="alert">{error}</p>}{history.length?history.map(entry=>entry.attempt?<ChatAttempt key={entry.id} attempt={entry.attempt} disabled={false} onReview={()=>window.open(workspace?.chat.provider_url||'https://chatgpt.com/','_blank','noopener,noreferrer')}/>:<article key={entry.id} className={entry.message!.role==='user'?'main-ai-user':'main-ai-reply'}><ChatMarkdown text={entry.message!.content}/></article>):<div className="main-ai-greeting"><span aria-hidden="true"><WindIcon size={38}/></span><h2>Your day, with a little help.</h2><p>Plan, adjust, and ask anything in Main Chat.</p></div>}</div><a className="main-ai-open-chat" href={workspace?.chat.provider_url||'https://chatgpt.com/'} target="_blank" rel="noreferrer">Continue in ChatGPT <span aria-hidden="true">↗</span></a></section>}
 </dialog></>
}
