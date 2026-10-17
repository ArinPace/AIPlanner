import { useEffect, useRef, useState } from 'react'
import { agentAction } from '../lib/agent'
import { VM_SOURCES, type VmJob, type VmSource, type VmState } from '../lib/vm'
import { CloseIcon } from './Icons'
import { ChatLinks } from './ChatLinks'
import { BrowserAccounts } from './BrowserAccounts'
import { connectionLoadingPage, connectionProgress } from '../lib/connectionProgress'

export function AgentSettings({ state, mode, aiReady, now, onClose, refresh }: { state: VmState; now: number; mode: 'setup' | 'connections' | 'settings'; aiReady: boolean; onClose: () => void; refresh: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const popup = useRef<Window | null>(null)
  const popupUrl = useRef('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sources, setSources] = useState<VmSource[]>(state.settings.sources)
  const [schedule, setSchedule] = useState(state.settings.schedule || { timezone: 'America/New_York', times: ['07:00', '17:00'] })
  const [scheduled, setScheduled] = useState(state.settings.schedule_enabled)
  const [apiKey, setApiKey] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [pair, setPair] = useState<{ code: string } | null>(null)
  const [connection, setConnection] = useState<{ label: string; started: number; cold: boolean; source?: VmSource; intent?: 'connect' | 'open' | 'manage' } | null>(null)
  const [clock, setClock] = useState(0)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const host = state.hosts[0]
  const requested = state.runs.find(r => r.id === requestId)
  const device = Date.parse(requested?.result.expiresAt || '') > now ? requested?.result.deviceCode : null
  const liveUrl = requested?.result.liveUrl && Date.parse(requested.result.expiresAt || '') > now ? requested.result.liveUrl : null
  const verified = Boolean(connection?.source && (requested?.result.connected === true || ((connection.intent !== 'open' || requested?.result.signInRequired) && Date.parse(state.settings.sites[connection.source]?.verifiedAt || '') >= connection.started)))
  const interrupted = requested?.result.interrupted === true
  const expired = Boolean(requested?.result.expiresAt && Date.parse(requested.result.expiresAt) <= now && !verified)
  const waiting = Boolean(connection && !verified && !interrupted && !expired && !liveUrl && !error && requested?.status !== 'failed' && requested?.status !== 'cancelled')
  const { stage, estimate, elapsed, detail, percent } = connectionProgress(requested?.status, state.power, connection?.cold || false, Math.max(0, Math.floor(((clock || connection?.started || 0) - (connection?.started || 0)) / 1000)))
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [waiting])
  useEffect(() => {
    if (!waiting || !popup.current || popup.current.closed || popupUrl.current) return
    const doc = popup.current.document
    for (const [key, value] of Object.entries({ stage, estimate, elapsed, detail })) {
      const node = doc.getElementById('connection-' + key)
      if (node) node.textContent = value
    }
    const bar = doc.getElementById('connection-bar') as HTMLProgressElement | null
    if (bar) bar.value = percent
    const label = doc.getElementById('connection-percent')
    if (label) label.textContent = `${percent}% · estimated`
  }, [waiting, stage, estimate, elapsed, detail, percent])
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    if ((interrupted || expired) && popup.current && !popup.current.closed) {
      const doc = popup.current.document
      const message = doc.createElement('p')
      message.textContent = 'This browser connection ended. Return to the planner and select Reopen browser to continue. Saved sign-ins are retained.'
      message.style.cssText = 'font:16px/1.7 system-ui;padding:32px;max-width:600px;margin:auto'
      doc.body.replaceChildren(message)
      return
    }
    if (verified) { popup.current?.close(); popup.current = null; return }
    if (liveUrl && popup.current && !popup.current.closed && popupUrl.current !== liveUrl) {
      popupUrl.current = liveUrl
      const doc = popup.current.document
      const frame = doc.createElement('iframe')
      frame.src = liveUrl; frame.title = 'Private browser'; frame.referrerPolicy = 'no-referrer'
      frame.style.cssText = 'border:0;width:100%;height:100dvh;display:block'
      doc.body.style.cssText = 'margin:0;display:block;background:#fff'
      doc.body.replaceChildren(frame)
    }
    if (requested?.status === 'failed') { popup.current?.close(); popup.current = null }
  }, [liveUrl, verified, interrupted, expired, requested?.status, requested?.error])
  useEffect(() => {
    if (mode === 'setup' && aiReady && state.settings.sources.length && state.settings.sources.every(s => state.settings.sites[s]?.ready)) onClose()
  }, [aiReady, state.settings.sites, state.settings.sources, mode, onClose])
  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action(); await refresh() } catch (e) { popup.current?.close(); popup.current = null; setError(e instanceof Error ? e.message : 'Please try again.') } finally { setBusy(false) }
  }
  async function save(next = sources) { await agentAction('vm/settings', { sources: next, schedule_enabled: scheduled && next.length > 0, schedule }) }
  function prepareSignInTab(label: string) {
    // Called only by Connect click handlers, never during render.
    // oxlint-disable-next-line react/purity
    const started = Date.now()
    setRequestId(null); setConnection({ label, started, cold: state.power !== 'online' }); setClock(started); popupUrl.current = ''
    popup.current?.close()
    popup.current = window.open('about:blank', '_blank')
    setPopupBlocked(!popup.current)
    if (popup.current) { popup.current.opener = null; popup.current.document.open(); popup.current.document.write(connectionLoadingPage); popup.current.document.close(); popup.current.document.getElementById('connection-title')!.textContent = `Connecting ${label}` }
  }
  function connect(source: VmSource, intent: 'connect' | 'open' | 'manage' = 'connect') {
    // Open synchronously in the click handler; delayed window.open is blocked.
    prepareSignInTab(VM_SOURCES[source].name)
    setConnection(current => current && { ...current, source, intent })
    void perform(async () => {
      const next = [...new Set([...sources, ...(source === 'gradescope' ? ['brightspace' as const] : []), source])]; setSources(next); await save(next)
      const job = await agentAction<VmJob>('vm/browser/open', { source, intent }); setRequestId(job.id)
      setNotice(intent === 'open' ? 'Opening the site in your saved browser session.' : source === 'gradescope' ? 'In Brightspace, open your course and use its Gradescope link. Sign-in is detected automatically.' : 'Sign in in the new tab. We will confirm automatically and close the sign-in tab.')
    })
  }
  function connectClaude() {
    if (!host?.capabilities.claudeConnected) prepareSignInTab('Claude')
    void perform(async () => {
      if (host?.capabilities.claudeConnected) { await agentAction('vm/provider', { provider: 'claude_code' }); setNotice('Using your connected Claude account.') }
      else { const job = await agentAction<VmJob>('vm/claude/connect'); setRequestId(job.id); setNotice('Preparing Claude authorization in the new tab. Your current AI stays connected.') }
    })
  }
  const aiConnections = <section className="assistant-settings-section"><h3>AI account</h3>
    <p>{aiReady ? `Connected · ${host?.capabilities.identity || 'OpenAI API'}` : 'Connect an AI account to start chatting.'}</p>
    {state.personalChatGptAvailable && <div className="assistant-provider"><strong>ChatGPT</strong>{host?.capabilities.chatgptConnected && <span className="connection-badge">Connected</span>}
      <button type="button" disabled={busy || !host} onClick={() => void perform(async () => {
        if (host?.capabilities.chatgptConnected) { await agentAction('vm/provider', { provider: 'chatgpt' }); setNotice('Using your connected ChatGPT account.') }
        else { const job = await agentAction<VmJob>('vm/chatgpt/connect', { method: 'device' }); setRequestId(job.id); setNotice('Requesting your OpenAI sign-in code…') }
      })}>{host?.capabilities.chatgptConnected ? 'Use ChatGPT' : 'Connect ChatGPT'}</button></div>}
    <div className="assistant-provider"><strong>Claude</strong>{host?.capabilities.claudeConnected && <span className="connection-badge">Connected</span>}
      <button type="button" disabled={busy || !host} onClick={connectClaude}>{host?.capabilities.claudeConnected ? 'Use Claude' : 'Connect Claude'}</button></div>
    <details><summary>Use an OpenAI API key</summary><form onSubmit={e => { e.preventDefault(); void perform(async () => { await agentAction('vm/ai', { apiKey }); setApiKey(''); setNotice('API key connected.') }) }}><label>API key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" required /></label><button disabled={busy}>Save API key</button></form></details>
    {device && !aiReady && <div className="assistant-connection-result"><p>Enter this code on OpenAI’s authorization page:</p><code>{device.userCode}</code><a href={device.verificationUrl} target="_blank" rel="noreferrer">Open OpenAI authorization ↗</a></div>}
  </section>
  return <dialog ref={dialog} className="assistant-settings" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }} aria-labelledby="agent-settings-title">
    <div className="assistant-settings-inner"><header><div><h2 id="agent-settings-title">{mode === 'settings' ? 'Settings' : mode === 'setup' ? 'Connect your assistant' : 'Connected sites'}</h2><p>{mode === 'connections' ? 'Add websites for your assistant to check.' : 'Your accounts, your schedule.'}</p></div><button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}><CloseIcon /></button></header>
      {(error || requested?.status === 'failed') && <p role="alert" className="agent-banner agent-error">{error || requested?.error || 'Connection could not be opened. Try again.'}</p>}{notice && !verified && <p role="status" className="agent-banner">{notice}</p>}
      {verified && <div className="assistant-connection-success" role="status"><strong>✓ {connection?.label} connected</strong><progress max="100" value="100" aria-label="Connection complete"/><p>Sign-in confirmed. Your session is saved on your private computer.</p></div>}
      {(interrupted || expired) && <div className="assistant-connection-result" role="alert"><p>{interrupted ? 'The private browser was interrupted.' : 'The private browser view expired.'} Your saved sign-ins are retained.</p>{connection?.source && <button type="button" disabled={busy} onClick={() => connect(connection.source!, connection.intent)}>Reopen browser</button>}</div>}
      {waiting && <div className="assistant-connection-progress" aria-label="Connection progress"><strong>{connection?.intent === 'open' ? 'Opening' : 'Connecting'} {connection?.label}</strong><p role="status">{stage}</p><progress max="100" value={percent} aria-label="Estimated connection progress"/><span className="assistant-progress-percent">{percent}% · estimated</span><p>{estimate}</p><small>{elapsed}</small><p>{detail}</p>{popupBlocked && <p>The sign-in tab was blocked. An Open private sign-in browser link will appear here when it is ready.</p>}</div>}
      {mode === 'setup' && !aiReady && aiConnections}
      {mode !== 'settings' && <section className="assistant-settings-section"><h3>{mode === 'setup' ? 'Connect your websites' : 'Websites'}</h3><div className="assistant-sites">{(Object.entries(VM_SOURCES) as [VmSource, { name: string }][]).map(([id, source]) => <div className="assistant-site-group" key={id}><div className="assistant-site"><label><input type="checkbox" checked={sources.includes(id)} onChange={e => setSources(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))}/><span><strong>{source.name}</strong><small>{state.settings.sites[id]?.ready ? 'Browser connected' : sources.includes(id) ? 'Sign-in needed' : 'Not connected'}{id === 'gradescope' ? ' - via Brightspace' : ''}</small></span></label><button type="button" disabled={busy || !host || Boolean(requested && ['queued','running'].includes(requested.status))} onClick={() => connect(id, state.settings.sites[id]?.ready ? 'open' : 'connect')}>{state.settings.sites[id]?.ready ? 'Open site' : id === 'gradescope' ? 'Connect via Brightspace' : 'Connect'}</button></div>
        <BrowserAccounts accounts={(state.accounts || []).filter(a=>a.source===id)} connected={state.settings.sites[id]?.ready===true && state.settings.sources.includes(id)} busy={busy || !host || Boolean(requested && ['queued','running'].includes(requested.status))} onOpen={()=>connect(id,'manage')} onEdit={(accountId,action,label)=>void perform(async()=>{await agentAction('vm/browser/accounts',{id:accountId,source:id,action,label});if(action==='remove' && state.accounts?.find(a=>a.id===accountId)?.active)setSources(current=>current.filter(s=>s!==id));setNotice(action==='rename' ? 'Account label saved.' : 'Account removed from planner. Use the website account menu to sign out of the website.')})}/>
      </div>)}</div><p className="quiet">WhatsApp: link this browser from WhatsApp on your phone using Linked devices. Only ask the agent to read conversations you choose.</p><div className="assistant-settings-actions"><button disabled={busy} onClick={() => void perform(async () => { await save(); setNotice('Website choices saved.') })}>Save websites</button><button disabled={busy || !host || !sources.length} onClick={() => void perform(async () => { await save(); const job = await agentAction<VmJob>('vm/browser/check'); setRequestId(job.id); setNotice('Verifying connections...') })}>Verify connections</button></div>{requested?.kind === 'browser_check' && requested.status === 'completed' && <p role="status">Connections checked. Sites needing sign-in are marked above.</p>}</section>}
      {liveUrl && !verified && <div className="assistant-connection-result"><progress max="100" value="100" aria-label="Browser startup complete"/><strong>100% · Browser ready</strong><p>{connection?.intent === 'open' ? 'Your saved browser session is open.' : 'Complete sign-in in the new tab. We are checking for success automatically.'} Recordings are off.</p><a href={liveUrl} target="_blank" rel="noreferrer">Open private sign-in browser ↗</a></div>}
      {!waiting && requested && ['queued','running'].includes(requested.status) && <p role="status">Preparing your connection…</p>}
      {mode === 'settings' && <><section className="assistant-settings-section"><h3>Schedule</h3><p>Check connected websites daily at the times you choose, even when you are away.</p><form onSubmit={e => { e.preventDefault(); void perform(async () => { await save(); setNotice('Schedule saved.') }) }}><label className="assistant-check"><input type="checkbox" checked={scheduled} onChange={e => setScheduled(e.target.checked)} />Enable scheduled checks</label><label>Timezone<input list="assistant-timezones" value={schedule.timezone} onChange={e => setSchedule({ ...schedule, timezone: e.target.value })} required /></label><datalist id="assistant-timezones">{['America/New_York','America/Los_Angeles','Europe/London','Asia/Singapore','Asia/Kolkata','UTC'].map(t => <option key={t} value={t}/>)}</datalist><div className="assistant-times">{schedule.times.map((time,index) => <div key={index}><label>Daily time {index+1}<input type="time" value={time} onChange={e => setSchedule({ ...schedule, times: schedule.times.map((t,i) => i===index ? e.target.value : t) })} required /></label><button type="button" disabled={schedule.times.length===1} onClick={() => setSchedule({ ...schedule, times: schedule.times.filter((_,i) => i!==index) })}>Remove time</button></div>)}</div><label>Review instructions<textarea value={schedule.instructions || ''} onChange={e=>setSchedule({...schedule,instructions:e.target.value})} maxLength={12000} rows={5} placeholder="What should the scheduled review check and report?" /></label><div className="assistant-settings-actions"><button type="button" disabled={schedule.times.length>=6} onClick={() => setSchedule({ ...schedule, times: [...schedule.times,'12:00'] })}>Add time</button><button disabled={busy}>Save schedule</button></div></form></section>
        <details className="assistant-advanced"><summary>Advanced</summary>{aiConnections}<section className="assistant-settings-section"><h3>Recent activity</h3>{state.runs.map(run => <p key={run.id}>{run.kind} · {run.status} · {new Date(run.created_at).toLocaleString()}{run.error ? ` · ${run.error}` : ''}</p>)}</section><section className="assistant-settings-section"><h3>Private computer</h3><p>{state.power === 'online' ? 'Online' : state.power === 'starting' ? 'Starting' : 'Offline'}. Starts at sign-in and sleeps after 30 idle minutes. Recordings are off.</p>{host && <button disabled={busy} onClick={() => void perform(async () => { await agentAction('vm/revoke', { id: host.id }); setNotice('Computer disconnected.') })}>Disconnect computer</button>}<button disabled={busy} onClick={() => void perform(async () => { setPair(await agentAction('vm/pair')) })}>Create pairing code</button>{pair && <code className="vm-command">{pair.code}</code>}</section><details><summary>Saved ChatGPT links & plugin</summary><ChatLinks active /></details></details></>}
      <footer><button type="button" onClick={onClose}>Done</button></footer>
    </div>
  </dialog>
}
