import { useCallback, useEffect, useRef, useState } from 'react'
import { agentAction, agentRequest } from '../lib/agent'
import type { VmChat, VmJob, VmState } from '../lib/vm'
import { AgentSettings } from './AgentSettings'
import { CloseIcon, MenuIcon, PlusIcon, SettingsIcon } from './Icons'

const pending = (job: VmJob) => ['queued', 'running'].includes(job.status)
export function AgentView({ active }: { active: boolean }) {
  const [state, setState] = useState<VmState | null>(null)
  const [chat, setChat] = useState<string | null>(null)
  const selectedChat = useRef<string | null>(null)
  const initialized = useRef(false)
  const [jobs, setJobs] = useState<VmJob[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [now, setNow] = useState(0)
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 700)
  const [panel, setPanel] = useState<'setup' | 'connections' | 'settings' | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const host = state?.hosts[0]
  const claude = state?.settings.ai_provider === 'claude_code'
  const aiReady = Boolean(state?.settings.ai_provider === 'openai_api' || (host?.capabilities.signedIn && (claude ? host.capabilities.runtime === 'claude' : host.capabilities.runtime !== 'claude')))
  const provider = claude ? 'Claude' : state?.settings.ai_provider === 'openai_api' ? 'OpenAI API' : 'ChatGPT'
  const power = state?.power || (host?.online ? 'online' : 'offline')
  const powerLabel = { online: 'Online', offline: 'Offline', starting: 'Starting', preparing: 'Preparing' }[power]
  const title = state?.chats.find(c => c.id === chat)?.title || 'New chat'
  const closePanel = useCallback(() => setPanel(null), [])
  const refresh = useCallback(async () => {
    const next = await agentRequest<VmState>('vm'); setState(next); setNow(Date.now())
    if (!initialized.current) {
      initialized.current = true
      if (next.chats.length) { selectedChat.current = next.chats[0].id; setChat(next.chats[0].id) }
    }
    const id = selectedChat.current
    if (id) {
      const result = await agentRequest<{ jobs: VmJob[] }>('vm/messages?chat=' + encodeURIComponent(id))
      if (selectedChat.current === id) setJobs(result.jobs)
    }
  }, [])
  useEffect(() => {
    if (!active) return
    const initial = window.setTimeout(() => void refresh().catch(e => setError(e.message)), 0)
    const timer = window.setInterval(() => void refresh().catch(e => setError(e.message)), 4000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [active, refresh])
  const lastReply = jobs.at(-1)?.reply
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [chat, jobs.length, lastReply])
  async function chooseChat(id: string) {
    selectedChat.current = id; setChat(id); setJobs([]); setMessage(''); setError(''); setLoadingChat(true)
    if (window.innerWidth <= 700) setSidebar(false)
    try { const result = await agentRequest<{ jobs: VmJob[] }>('vm/messages?chat=' + encodeURIComponent(id)); if (selectedChat.current === id) setJobs(result.jobs) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open this chat.') }
    finally { if (selectedChat.current === id) setLoadingChat(false) }
  }
  function newChat() {
    selectedChat.current = null; setChat(null); setJobs([]); setMessage(''); setError(''); setLoadingChat(false)
    if (window.innerWidth <= 700) setSidebar(false)
  }
  async function send() {
    if (busy || loadingChat || !message.trim() || !aiReady || !host || jobs.some(pending)) return
    setBusy(true); setError('')
    try {
      let id = selectedChat.current
      let untitled = !id || state?.chats.find(c => c.id === id)?.title === 'New conversation'
      if (!id) { const created = await agentAction<VmChat>('vm/chats', { title: message.slice(0,80) }); id = created.id; selectedChat.current = id; setChat(id); untitled = false }
      await agentAction('vm/send', { chatId: id, message, ...(untitled ? { title: message.slice(0,80) } : {}) })
      setMessage(''); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send your message.') }
    finally { setBusy(false) }
  }
  return <main className={'assistant-app' + (sidebar ? ' sidebar-open' : '')}>
    {sidebar && <aside className="assistant-sidebar" aria-label="Chat sidebar">
      <div className="assistant-sidebar-top"><strong>Your chats</strong><button type="button" className="icon-btn" aria-label="Hide chat sidebar" onClick={() => setSidebar(false)}><CloseIcon size={18}/></button></div>
      <button type="button" className="assistant-new-chat" onClick={newChat}><PlusIcon size={18}/>New chat</button>
      <nav aria-label="Conversations" className="assistant-conversations">{state?.chats.map(item => <button type="button" key={item.id} title={item.title} aria-current={item.id === chat ? 'page' : undefined} onClick={() => void chooseChat(item.id)}>{item.title}</button>)}{state && !state.chats.length && <p>No conversations yet.</p>}</nav>
      <button type="button" className="assistant-sidebar-settings" onClick={() => setPanel('settings')}><SettingsIcon size={18}/>Settings</button>
    </aside>}
    {sidebar && <button type="button" className="assistant-sidebar-scrim" aria-label="Close chat sidebar" onClick={() => setSidebar(false)}/>}
    <section className="assistant-chat" aria-label="Assistant chat">
      <header className="assistant-chat-header"><div>{!sidebar && <button type="button" className="icon-btn" aria-label="Show chat sidebar" onClick={() => setSidebar(true)}><MenuIcon/></button>}<button type="button" className="icon-btn" aria-label="New chat" onClick={newChat}><PlusIcon/></button><div className="assistant-chat-title"><strong>{title}</strong><span>{state ? aiReady ? `${provider} connected` : 'Connect your AI to get started' : 'Loading…'}</span>{state && <span className={'assistant-power ' + power} role="status" aria-label="Virtual machine status"><i aria-hidden="true"/>VM {powerLabel}</span>}</div></div><div><button type="button" className="assistant-sites-button" onClick={() => setPanel('connections')}>Add sites</button><button type="button" className="icon-btn" aria-label="Agent settings" onClick={() => setPanel('settings')}><SettingsIcon/></button></div></header>
      {error && <p role="alert" className="assistant-error">{error}</p>}
      {state?.provisioning?.error && <p role="alert" className="assistant-error">{state.provisioning.error}</p>}
      <div className="assistant-thread" aria-live="polite">
        <div className="assistant-thread-content">
          {!jobs.length && <div className="assistant-welcome"><span className="assistant-spark">✦</span><h1>{loadingChat ? 'Opening your chat…' : 'What can I help with?'}</h1><p>{aiReady ? 'Plan your day, organize your files, or check your connected sites.' : 'Connect your AI account once. Then keep the conversation here.'}</p>{state && !aiReady && <button type="button" className="assistant-primary" onClick={() => setPanel('setup')}>Connect AI</button>}</div>}
          {jobs.map(job => <article key={job.id} className="assistant-turn"><div className="assistant-user-message">{job.message}</div>{job.reply && <div className="assistant-reply">{job.reply}</div>}{pending(job) && <div className="assistant-working"><span className="assistant-pulse"/>{job.status === 'queued' ? host?.online ? 'Waiting for your agent…' : 'Waking your private computer…' : 'Working…'}<button type="button" onClick={() => { void agentAction('vm/cancel', { id: job.id }).then(refresh).catch(e => setError(e.message)) }}>Stop</button></div>}{job.error && <p role="alert" className="assistant-error">{job.error}</p>}</article>)}<div ref={end}/>
        </div>
      </div>
      <div className="assistant-compose-wrap"><form className="assistant-compose" onSubmit={e => { e.preventDefault(); void send() }}><label className="sr-only" htmlFor="assistant-message">Message your assistant</label><textarea id="assistant-message" placeholder="Message your assistant…" value={message} rows={2} maxLength={12000} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}/><div><button type="button" className="assistant-compose-connect" onClick={() => setPanel(aiReady ? 'connections' : 'setup')}>{aiReady ? '+ Add sites' : 'Connect AI'}</button><button type="submit" className="assistant-send" aria-label="Send message" disabled={busy || loadingChat || !message.trim() || !aiReady || !host || jobs.some(pending)}>↑</button></div></form><p className="assistant-compose-note">Your assistant can make mistakes. Check important details.</p></div>
    </section>
    {state && panel && <AgentSettings state={state} now={now} mode={panel} aiReady={aiReady} onClose={closePanel} refresh={refresh}/>}
  </main>
}
