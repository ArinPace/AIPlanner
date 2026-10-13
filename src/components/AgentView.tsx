import { useCallback, useEffect, useRef, useState } from 'react'
import { agentAction, agentRequest, type AgentSource, type AgentState } from '../lib/agent'

const SOURCES: { id: AgentSource; label: string; url: string }[] = [
  { id: 'brightspace', label: 'Brightspace', url: 'https://brightspace.nyu.edu' },
  { id: 'gradescope', label: 'Gradescope', url: 'https://www.gradescope.com' },
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com' },
  { id: 'calendar', label: 'Google Calendar', url: 'https://calendar.google.com' },
  { id: 'drive', label: 'Google Drive', url: 'https://drive.google.com' },
]
function when(value: string) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
export function AgentView({ active }: { active: boolean }) {
  const [state, setState] = useState<AgentState | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [content, setContent] = useState('')
  const [sources, setSources] = useState<AgentSource[]>(['brightspace'])
  const [schedule, setSchedule] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [task, setTask] = useState('Check my courses for new assignments, deadline changes, announcements, grades, and relevant academic updates.')
  const dirtyRef = useRef(false)
  const refresh = useCallback(async () => {
    const next = await agentRequest<AgentState>('status')
    setState(next)
    if (!dirtyRef.current) { setSources(next.settings.sources); setSchedule(next.settings.schedule_enabled) }
    setError('')
  }, [])
  useEffect(() => {
    if (!active) return
    let alive = true
    const update = () => { if (alive) void refresh().catch(e => { if (alive) setError(e.message) }) }
    update()
    const timer = window.setInterval(update, 15000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [active, refresh])
  async function perform(name: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(name); setError(''); setNotice('')
    try { await action(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete this action.') }
    finally { setBusy('') }
  }
  const syncActive = state?.runs.some(r => r.kind === 'sync' && ['starting', 'running', 'applying'].includes(r.status))
  const lastSync = state?.runs.find(r => r.kind === 'sync' && r.applied_at)
  const enabled = state?.allowed && !busy
  return <main className="agent-workspace">
    <div className="agent-heading"><div><p className="agent-eyebrow">YOUR PLANNER ASSISTANT</p><h1>Stay a step ahead.</h1><p>Check your courses, collect updates, and plan what comes next.</p></div><span className="agent-recording">Recordings off</span></div>
    {error && <p className="agent-banner agent-error" role="alert">{error}</p>}
    {notice && <p className="agent-banner" role="status">{notice}</p>}
    {!state && !error && <p role="status">Loading your agent…</p>}
    {state && !state.allowed && <p className="agent-banner">Agent access is not enabled for this account.</p>}
    <div className="agent-layout">
      <section className="agent-card agent-chat" aria-labelledby="agent-chat-heading">
        <div className="agent-card-heading"><div><h2 id="agent-chat-heading">Chat with your planner</h2><p>Ask about your calendar and saved notes, or ask to launch a sync.</p></div><span className="agent-status">{busy === 'chat' ? 'Thinking…' : state?.chatConfigured ? 'Ready' : 'Connection needed'}</span></div>
        <div className="agent-messages" aria-live="polite" aria-busy={busy === 'chat'}>
          {!state?.messages.length && <div className="agent-empty"><span aria-hidden="true">✦</span><h3>A little less checking.<br />A little more planning.</h3><p>Try “What is due this week?” or “Check my courses for updates.”</p></div>}
          {state?.messages.map(message => <article key={message.id} className={`agent-message ${message.role}`}><div>{message.role === 'user' ? 'You' : 'Planner'} <time dateTime={message.created_at}>{when(message.created_at)}</time></div><p>{message.content}</p></article>)}
          {busy === 'chat' && <p role="status">Planner is thinking…</p>}
        </div>
        <form className="agent-chat-form" onSubmit={e => { e.preventDefault(); void perform('chat', async () => { await agentAction('chat', { content }); setContent('') }) }}>
          <label className="sr-only" htmlFor="agent-message">Message your planner</label><textarea id="agent-message" placeholder="Ask your planner…" value={content} maxLength={12000} onChange={e => setContent(e.target.value)} rows={2} disabled={!state?.allowed || busy === 'chat'} />
          <button type="submit" disabled={!enabled || !state?.chatConfigured || !content.trim()}>{busy === 'chat' ? 'Thinking…' : 'Send'}</button>
        </form>
        <p className="agent-footnote">Chat uses the planner’s AI connection. Connecting a ChatGPT identity requires an approved OpenAI application.</p>
      </section>
      <aside className="agent-side">
        <section className="agent-card" aria-labelledby="agent-sync-heading"><div className="agent-card-heading"><div><h2 id="agent-sync-heading">Course sync</h2><p>{lastSync ? `Last saved ${when(lastSync.applied_at!)}` : 'Your first sync is waiting.'}</p></div><span className="agent-status">{syncActive ? 'Running' : 'Ready to check'}</span></div>
          <fieldset className="agent-sources"><legend>Sources to check</legend>{SOURCES.map(source => <label key={source.id}><input type="checkbox" checked={sources.includes(source.id)} disabled={!enabled} onChange={e => { setSources(e.target.checked ? [...sources, source.id] : sources.filter(s => s !== source.id)); setDirty(true); dirtyRef.current = true }} /><span>{source.label}</span></label>)}</fieldset>
          <label className="agent-schedule"><input type="checkbox" checked={schedule} disabled={!enabled} onChange={e => { setSchedule(e.target.checked); setDirty(true); dirtyRef.current = true }} /><span><strong>Check twice daily</strong><small>7 AM and 5 PM · New York time<br />Runs in the cloud, even with your laptop off.</small></span></label>
          <button className="agent-secondary" type="button" disabled={!enabled || !dirty || !sources.length} onClick={() => void perform('settings', async () => { await agentAction('settings', { sources, schedule_enabled: schedule }); dirtyRef.current = false; setDirty(false); setNotice('Sync preferences saved.') })}>Save preferences</button>
          <label className="agent-task" htmlFor="agent-task">What should the agent check?</label><textarea id="agent-task" rows={3} value={task} maxLength={3000} onChange={e => setTask(e.target.value)} />
          <button className="agent-launch" type="button" disabled={!enabled || !state?.browserConfigured || !state?.settings.profile_id || !!state?.settings.login_browser_id || syncActive || dirty} onClick={() => void perform('launch', async () => { await agentAction('launch', { task }); setNotice('Agent launched. You can leave this page; its progress will appear in run history.') })}>{syncActive ? 'Agent running…' : 'Launch agent'}</button>
          {dirty && <p className="agent-footnote">Save your preferences before launching.</p>}
        </section>
        <section className="agent-card"><h2>Connections</h2><p className="agent-subtitle">Save your school login for future cloud sessions.</p>
          <div className="agent-connection"><div><strong>Cloud browser</strong><small>{state?.settings.login_browser_id ? 'Login window open' : state?.settings.profile_id ? 'Saved profile · login may expire' : 'Not connected'}</small></div><button type="button" className="agent-secondary" disabled={!enabled || !state?.browserConfigured || syncActive} onClick={() => {
            const popup = window.open('about:blank', '_blank')
            void perform('connect', async () => { try { const result = await agentAction<{ url: string }>('browser/connect'); if (popup) popup.location.href = result.url; else setNotice('Login window ready. Use “Open login window” below.') } catch (e) { popup?.close(); throw e } })
          }}>{state?.settings.profile_id ? 'Reconnect' : 'Connect'}</button></div>
          {state?.settings.login_url && <div className="agent-login-help"><a href={state.settings.login_url} target="_blank" rel="noreferrer">Open login window ↗</a><p>In that cloud window, sign into each enabled source. Use these addresses:</p>{SOURCES.filter(s => sources.includes(s.id)).map(s => <p key={s.id}>{s.label}: <code>{s.url}</code></p>)}<p>Finish SSO and MFA, then save below. Save before the one-hour window expires.</p><button type="button" className="agent-secondary" disabled={!enabled} onClick={() => void perform('save-login', async () => { await agentAction('browser/save'); setNotice('Login window closed and profile saved. You can launch a sync now.') })}>Save login and close window</button></div>}
          {(['google', 'openai'] as const).map(provider => { const connection = state?.connections.find(c => c.provider === provider); return <div className="agent-connection" key={provider}><div><strong>{provider === 'google' ? 'Google APIs' : 'ChatGPT identity'}</strong><small>{connection?.identity || (state?.oauth[provider] ? 'Ready to connect' : 'Application setup required')}</small></div><button type="button" className="agent-secondary" disabled={!enabled} onClick={() => void perform(provider, async () => { const result = await agentAction<{ url: string }>('oauth/start', { provider }); window.location.assign(result.url) })}>{provider === 'openai' ? 'Continue with ChatGPT' : 'Connect Google'}</button></div> })}
          <p className="agent-footnote">Google API access is read-only. Existing Google connections in this chat are separate. Browser sync can use the accounts you sign into in the cloud window.</p>
        </section>
      </aside>
    </div>
    <section className="agent-card agent-history"><div className="agent-card-heading"><div><h2>Run history</h2><p>Launch times, outcomes, and updates saved to your planner.</p></div><button type="button" className="agent-secondary" disabled={!!busy} onClick={() => void perform('refresh', refresh)}>Refresh</button></div>
      {!state?.runs.length && <p className="agent-subtitle">No runs yet. Your first launch will appear here.</p>}
      {state?.runs.map(run => <details className="agent-run" key={run.id}><summary><span className={`agent-run-dot ${run.status}`} /><span><strong>{run.kind === 'chat' ? 'Planner chat' : run.kind === 'login' ? 'Cloud login' : 'Course sync'}</strong><small>{when(run.created_at)} · {run.trigger}</small></span><span className="agent-run-status">{run.status.replaceAll('_', ' ')}</span></summary><div><p>{run.task}</p>{run.summary && <p className="agent-result">{run.summary}</p>}{run.error && <p role="alert" className="agent-error">{run.error}</p>}{run.finished_at && <p>Finished {when(run.finished_at)}</p>}{run.applied_at && <p>Saved to Calendar and Files. Reload those workspaces to see the latest updates.</p>}{run.live_url && ['starting', 'running'].includes(run.status) && <a href={run.live_url} target="_blank" rel="noreferrer">View cloud browser ↗</a>}</div></details>)}
    </section>
  </main>
}
