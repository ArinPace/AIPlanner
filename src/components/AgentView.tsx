import { useCallback, useEffect, useRef, useState } from 'react'
import { agentAction, agentRequest } from '../lib/agent'
import { VM_SOURCES, type VmChat, type VmJob, type VmSource, type VmState } from '../lib/vm'
import { ChatLinks } from './ChatLinks'

const pending = (job: VmJob) => ['queued', 'running'].includes(job.status)
export function AgentView({ active }: { active: boolean }) {
  const [state, setState] = useState<VmState | null>(null)
  const [chat, setChat] = useState<string | null>(null)
  const [jobs, setJobs] = useState<VmJob[]>([])
  const [message, setMessage] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [sources, setSources] = useState<VmSource[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(false)
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null)
  const [liveJobId, setLiveJobId] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const loadedSources = useRef(false)
  const host = state?.hosts[0]
  const claudeSelected = state?.settings.ai_provider === 'claude_code'
  const aiReady = Boolean(state?.settings.ai_provider === 'openai_api' || (host?.capabilities.signedIn && (claudeSelected ? host.capabilities.runtime === 'claude' : host.capabilities.runtime !== 'claude')))
  const sitesReady = Boolean(state?.settings.sources.length && state.settings.sources.every(s => state.settings.sites[s]?.ready))
  const ready = Boolean(aiReady && sitesReady && host?.online)
  const live = state?.runs.find(r => r.id === liveJobId) || state?.runs.find(r => r.kind === 'browser_login' && r.status === 'completed' && r.result.liveUrl && Date.parse(r.result.expiresAt || '') > now)
  const liveUrl = live?.result.liveUrl && Date.parse(live.result.expiresAt || '') > now ? live.result.liveUrl : null
  const authJob = state?.runs.find(r => r.message === 'chatgpt_device')
  const device = !aiReady && authJob?.result.deviceCode && Date.parse(authJob.result.expiresAt || '') > now ? authJob.result.deviceCode : null
  const refresh = useCallback(async () => {
    const next = await agentRequest<VmState>('vm'); setState(next); setNow(Date.now())
    if (!loadedSources.current) { setSources(next.settings.sources); loadedSources.current = true }
    if (chat) setJobs((await agentRequest<{ jobs: VmJob[] }>('vm/messages?chat=' + encodeURIComponent(chat))).jobs)
  }, [chat])
  useEffect(() => {
    if (!active) return
    let alive = true
    const load = () => { if (alive) void refresh().catch(e => { if (alive) setError(e.message) }) }
    load(); const timer = window.setInterval(load, 4000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [active, refresh])
  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete this action.') }
    finally { setBusy(false) }
  }
  async function saveSources() { await agentAction('vm/settings', { sources, schedule_enabled: state?.settings.schedule_enabled || false }) }
  async function newChat() {
    const next = await agentAction<VmChat>('vm/chats', { title: 'New conversation' })
    setChat(next.id); setJobs([]); return next.id
  }
  async function send() {
    const id = chat || await newChat()
    await agentAction('vm/send', { chatId: id, message, ...(!jobs.length ? { title: message.slice(0, 80) } : {}) })
    setMessage(''); await refresh()
    setJobs((await agentRequest<{ jobs: VmJob[] }>('vm/messages?chat=' + encodeURIComponent(id))).jobs)
  }
  return <main className="agent-workspace planner-assistant">
    <div className="agent-heading"><div><p className="agent-eyebrow">YOUR PLANNER ASSISTANT</p><h1>A little help, every day.</h1><p>Connect your AI and websites. Keep the conversation here.</p></div><button className="agent-secondary" type="button" onClick={() => setSetup(!setup)}>{setup ? 'Back to chats' : 'Setup & connections'}</button></div>
    {error && <p className="agent-banner agent-error" role="alert">{error}</p>}{notice && <p className="agent-banner" role="status">{notice}</p>}
    {!state && !error && <p role="status">Loading your assistant…</p>}
    {state && <>
      <div className="vm-status-strip"><span className={'vm-dot ' + (host?.online ? 'online' : '')}/><span>{host?.online ? 'Your private computer is online' : host ? 'Your private computer wakes when needed' : 'Preparing your private computer'}</span><span className="vm-status-label">{ready ? 'Ready to help' : 'Finish setup below'}</span></div>
      {state.provisioning?.error && <p role="alert" className="agent-banner agent-error">{state.provisioning.error}</p>}
      {(setup || !aiReady || !sitesReady) && <section className="agent-card vm-setup" aria-labelledby="assistant-setup-title">
        <h2 id="assistant-setup-title">Make it yours.</h2><p>Three simple steps. Your connections stay private to your account.</p>
        <ol className="vm-steps"><li className="done">Sign in</li><li className={aiReady ? 'done' : ''}>Connect AI</li><li className={sitesReady ? 'done' : ''}>Sign into websites</li></ol>
        <div className="vm-setup-section"><h3>1. Choose your AI</h3>{aiReady && <p className="vm-ready">Connected · {host?.capabilities.identity || 'OpenAI API'}</p>}
          <details><summary>Use an OpenAI API key</summary><form className="vm-key-form" onSubmit={e => { e.preventDefault(); void perform(async () => { await agentAction('vm/ai', { apiKey }); setApiKey(''); setNotice('API key verified and saved securely.') }) }}><label htmlFor="vm-api-key">OpenAI API key</label><input id="vm-api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" required/><button className="agent-launch" disabled={busy || !apiKey.trim()}>Connect AI</button><small>API usage is billed by OpenAI. Your key is encrypted in storage and never included in chat messages.</small></form>{state.settings.ai_provider && <button type="button" className="agent-secondary" disabled={busy} onClick={() => void perform(async () => { await agentAction('vm/ai/disconnect'); setNotice('API key removed. A separately authorized personal ChatGPT account remains on its VM.') })}>Remove API key</button>}</details>
          <details><summary>Use a ChatGPT subscription</summary>{state.personalChatGptAvailable ? <>
            <p>For your personal self-hosted agent. Authorize on OpenAI’s page in your own browser, on your phone or computer.{state.settings.ai_provider ? ' Switching to ChatGPT removes your saved API key.' : ''}</p>
            <button type="button" className="agent-launch" disabled={busy || !host || Boolean(authJob && pending(authJob))} onClick={() => void perform(async () => { const job = await agentAction<VmJob>('vm/chatgpt/connect', { method: 'device' }); setLiveJobId(job.id); setNotice('Waking your agent and requesting an OpenAI device code. It will appear here shortly.') })}>Continue with ChatGPT</button>
            {authJob && pending(authJob) && <p role="status">Preparing your sign-in code…</p>}
            {device && <div className="vm-live"><h4>Authorize your agent</h4><p>Open OpenAI, enter this one-use code, then return here. Keep this code private. It expires in 10 minutes.</p><code className="vm-command">{device.userCode}</code><a className="agent-launch agent-open-chat" href={device.verificationUrl} target="_blank" rel="noreferrer">Open OpenAI authorization ↗</a><p role="status">Waiting for authorization…</p></div>}
            {authJob?.status === 'failed' && <p role="alert" className="agent-error">{authJob.error}</p>}
            {host?.capabilities.signedIn && host.capabilities.identity !== 'OpenAI API' && <button type="button" className="agent-secondary" disabled={busy} onClick={() => void perform(async () => { await agentAction('vm/chatgpt/disconnect'); setNotice('Disconnecting ChatGPT from your personal VM.') })}>Disconnect ChatGPT</button>}
          </> : <p>Hosted ChatGPT subscription sign-in requires provider approval and is not enabled for this account. You can use an API key now.</p>}</details>
          <details><summary>Use a Claude subscription</summary>
            <p>Sign into Claude Code on your private computer using Anthropic’s own authorization page. Claude Code keeps and refreshes your login. Usage follows your Claude plan.</p>
            <button type="button" className="agent-launch" disabled={busy || !host || state.runs.some(r => r.message === 'claude_connect' && pending(r))} onClick={() => void perform(async () => { const job = await agentAction<VmJob>('vm/claude/connect'); setLiveJobId(job.id); setNotice('Opening Claude Code authorization. The private browser link will appear below. This switches your active AI to Claude.') })}>Continue with Claude</button>
            {claudeSelected && <button type="button" className="agent-secondary" disabled={busy} onClick={() => void perform(async () => { await agentAction('vm/claude/disconnect'); setNotice('Disconnecting Claude Code. Your separate ChatGPT login remains on its VM.') })}>Disconnect Claude</button>}
            {state.runs.find(r => r.message === 'claude_connect')?.status === 'failed' && <p role="alert" className="agent-error">{state.runs.find(r => r.message === 'claude_connect')?.error}</p>}
          </details>
        </div>
        <div className="vm-setup-section"><h3>2. Choose your websites</h3><p>Select what your assistant may check, then sign in through your private browser.</p><div className="vm-site-grid">{(Object.entries(VM_SOURCES) as [VmSource, { name: string; url: string }][]).map(([id, source]) => <div className="vm-site" key={id}><label><input type="checkbox" checked={sources.includes(id)} onChange={e => setSources(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))}/><span>{source.name}<small>{state.settings.sites[id]?.ready ? 'Connection verified' : sources.includes(id) ? 'Sign-in needed' : 'Not selected'}</small></span></label><button className="agent-secondary" type="button" disabled={busy || !sources.includes(id) || !host} onClick={() => void perform(async () => { await saveSources(); const job = await agentAction<VmJob>('vm/browser/open', { source: id }); setLiveJobId(job.id); setNotice('Opening your private browser. The sign-in link will appear shortly.') })}>Sign in</button></div>)}</div><button type="button" className="agent-secondary" disabled={busy} onClick={() => void perform(async () => { await saveSources(); setNotice('Website choices saved.') })}>Save websites</button>
          {liveUrl && <div className="vm-live"><h4>Your browser is ready</h4><p>Sign in on the website, then return here. This private view closes after 20 minutes. Recordings are off.</p><a className="agent-launch agent-open-chat" href={liveUrl} target="_blank" rel="noreferrer">Open private browser ↗</a></div>}{live?.status === 'failed' && <p role="alert" className="agent-error">{live.error}</p>}
        </div>
        <div className="vm-setup-section"><h3>3. Check and finish</h3><p>We’ll check whether your selected websites are accessible before calling setup complete.</p><button type="button" className="agent-launch" disabled={busy || !host || !sources.length} onClick={() => void perform(async () => { await saveSources(); await agentAction('vm/browser/check'); setLiveJobId(null); setNotice('Checking website connections. This can take a minute.') })}>Verify connections</button><label className="vm-schedule"><input type="checkbox" checked={state.settings.schedule_enabled} disabled={busy || !ready} onChange={e => void perform(async () => { await agentAction('vm/settings', { sources, schedule_enabled: e.target.checked }); setNotice(e.target.checked ? 'Daily checks enabled at 7 AM and 5 PM New York time.' : 'Daily checks paused.') })}/>Check for updates at 7 AM and 5 PM · New York time</label>{ready && <p className="vm-ready" role="status">You’re set up. Your assistant can now work from this planner.</p>}</div>
      </section>}
      <section className="vm-chat-workspace agent-card" aria-label="Assistant chats"><aside className="vm-chat-list"><button type="button" className="agent-launch" disabled={busy} onClick={() => void perform(async () => { await newChat() })}>New chat</button>{state.chats.map(item => <button key={item.id} type="button" className={chat === item.id ? 'selected' : ''} onClick={() => { setChat(item.id); setJobs([]) }}>{item.title}</button>)}</aside><div className="vm-chat-main"><div className="vm-transcript" aria-live="polite">{!jobs.length && <div className="agent-empty"><h2>What can I help with?</h2><p>Ask about your week, organize files, or check for course updates.</p></div>}{jobs.map(job => <article className="vm-exchange" key={job.id}><p className="vm-user-message">{job.message}</p>{job.reply && <p className="vm-assistant-message">{job.reply}</p>}{pending(job) && <p className="vm-run-state">{job.status === 'queued' ? host?.online ? 'Waiting for your agent…' : 'Queued until your private computer is online.' : 'Working…'}<button className="agent-secondary" type="button" disabled={busy} onClick={() => void perform(async () => { await agentAction('vm/cancel', { id: job.id }) })}>Stop</button></p>}{job.error && <p role="alert" className="agent-error">{job.error}</p>}<small>{new Date(job.created_at).toLocaleString()} · {job.status}</small></article>)}</div><form className="vm-compose" onSubmit={e => { e.preventDefault(); void perform(send) }}><label htmlFor="assistant-message">Message your assistant</label><textarea id="assistant-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask your planner…" rows={3} maxLength={12000}/><button className="agent-launch" disabled={busy || !message.trim() || !aiReady || !host || jobs.some(pending)}>Send</button></form></div></section>
      <details className="agent-card"><summary>Recent activity</summary><div className="vm-activity">{state.runs.map(run => <div key={run.id}><strong>{run.kind === 'chat' ? 'Chat' : run.kind === 'sync' ? 'Scheduled check' : 'Website connection'}</strong><span>{run.status} · {new Date(run.created_at).toLocaleString()}</span>{run.error && <p className="agent-error">{run.error}</p>}</div>)}{!state.runs.length && <p>No agent runs yet.</p>}</div></details>
      <details className="agent-card"><summary>Private computer settings</summary><p>Each planner account uses its own VM, browser profile, and AI connection.</p>{host && <button className="agent-secondary" type="button" disabled={busy} onClick={() => void perform(async () => { await agentAction('vm/revoke', { id: host.id }); setNotice('Computer disconnected. Its browser and ChatGPT credentials remain on its VM until removed there.') })}>Disconnect computer</button>}<button className="agent-secondary" type="button" disabled={busy} onClick={() => void perform(async () => { setPair(await agentAction('vm/pair')) })}>Create pairing code</button>{pair && <div><p>Use once on the Windows host before {new Date(pair.expiresAt).toLocaleTimeString()}. Pairing replaces the previous worker.</p><code className="vm-command">{pair.code}</code></div>}</details>
    </>}
    <details className="agent-card"><summary>Saved ChatGPT links & plugin connection</summary><ChatLinks active={active}/></details>
  </main>
}
