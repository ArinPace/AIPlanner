import {ChatExperiment} from './components/ChatExperiment'
import {GrokExperiment} from './components/GrokExperiment'
import {RECOVERY_TAB} from './lib/attachmentRecovery'
import { PlannerDate as Date } from './lib/timezone.js'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FilesView } from './components/FilesView'
import { AgentView } from './components/AgentView'
import { EventModal } from './components/EventModal'
import { Header } from './components/Header'
import { LoginScreen } from './components/LoginScreen'
import { MonthView } from './components/MonthView'
import { Sidebar } from './components/Sidebar'
import { TimeGridView } from './components/TimeGridView'
import { YearView } from './components/YearView'
import { adoptCalendarRevision, emptyCalendar, getSession, loadCalendar, logout, saveCalendar, setToken } from './lib/api'
import { isEventVisible } from './lib/colors'
import {
  addDays,
  addMonths,
  addYears,
  combineDateAndTime,
  endOfDateInput,
  startOfDateInput,
  toDateInput,
  toTimeInput,
  visibleRange,
} from './lib/dates'
import { expandEvents } from './lib/recurrence'
import { createId } from './lib/storage'
import { useDatePinch } from './lib/useDatePinch'
import { useVmActivity } from './lib/useVmActivity'
import { clampZoom, DEFAULT_ZOOM, ZOOM_STEP } from './lib/zoom'
import type { CalendarEvent, CalendarView, EventDraft, StoredState, Tag } from './types'

function emptyRecurrence() {
  return { frequency: 'none' as const, interval: 1, until: null }
}
function calendarFingerprint(state: StoredState) {
  return JSON.stringify({ events: state.events, tags: state.tags, hiddenTagIds: state.hiddenTagIds, zoom: clampZoom(state.zoom ?? DEFAULT_ZOOM) })
}

function draftFromPreset(date: Date, options?: { timed?: boolean; allDay?: boolean }): EventDraft {
  const allDay = Boolean(options?.allDay)
  const start = options?.timed
    ? date
    : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    title: '',
    description: '',
    date: toDateInput(start),
    endDate: toDateInput(allDay ? start : end),
    startTime: toTimeInput(start),
    endTime: toTimeInput(end),
    allDay,
    tagIds: [],
    recurrence: emptyRecurrence(),
  }
}

function draftFromEvent(event: CalendarEvent): EventDraft {
  const start = new Date(event.start)
  const end = new Date(event.end)
  return {
    reminder: event.reminder,
    urgency: event.urgency,
    title: event.title,
    description: event.description,
    date: toDateInput(start),
    endDate: toDateInput(end),
    startTime: toTimeInput(start),
    endTime: toTimeInput(end),
    allDay: event.allDay,
    tagIds: [...event.tagIds],
    recurrence: { ...event.recurrence },
  }
}

function eventFromDraft(draft: EventDraft, id: string): CalendarEvent {
  const start = draft.allDay ? startOfDateInput(draft.date) : combineDateAndTime(draft.date, draft.startTime)
  const end = draft.reminder && !draft.allDay ? new Date(start.getTime()+1) : draft.allDay ? endOfDateInput(draft.reminder?draft.date:draft.endDate) : combineDateAndTime(draft.endDate, draft.endTime)
  return {
    id,
    reminder: Boolean(draft.reminder),
    ...(draft.urgency===undefined?{}:{urgency:draft.urgency}),
    title: draft.title.trim(),
    description: draft.description.trim(),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: draft.allDay,
    tagIds: draft.tagIds,
    recurrence: {
      frequency: draft.recurrence.frequency,
      interval: Math.max(1, draft.recurrence.interval || 1),
      until: draft.recurrence.frequency === 'none' ? null : draft.recurrence.until,
    },
  }
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getSession()
      .then((session) => setUsername(session.username))
      .catch(() => setUsername(null))
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="login-screen">
        <p className="quiet">Loading calendar…</p>
      </div>
    )
  }

  if (!username) {
    return <LoginScreen onSignedIn={setUsername} />
  }

  return (
    <CalendarApp
      username={username}
      onLogout={() => {
        void logout().finally(() => {
          setToken(null)
          setUsername(null)
        })
      }}
    />
  )
}

function CalendarApp({ username, onLogout }: { username: string; onLogout: () => void }) {
  useVmActivity(username)
  const [tab, setTab] = useState<'calendar' | 'files' | 'agent' | 'grok' | 'chat'>(()=>sessionStorage.getItem(RECOVERY_TAB)===username?'agent':'calendar')
  const [filesUnsaved, setFilesUnsaved] = useState(false)
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>('month')
  const [filesSidebar,setFilesSidebar]=useState(()=>window.innerWidth>600)
  const [agentSidebar,setAgentSidebar]=useState(()=>window.innerWidth>700)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 861px)').matches)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [hiddenTagIds, setHiddenTagIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const mainRef = useRef<HTMLElement>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const persistedCalendar = useRef('')

  const applyState = useCallback((state: StoredState) => {
    persistedCalendar.current = calendarFingerprint(state)
    setEvents(state.events)
    setTags(state.tags)
    setHiddenTagIds(state.hiddenTagIds)
    setZoom(clampZoom(state.zoom ?? DEFAULT_ZOOM))
  }, [])

  useEffect(() => {
    loadCalendar()
      .then((state) => {
        applyState(state)
        setLoadError('')
      })
      .catch((error) => {
        applyState(emptyCalendar())
        setLoadError(error instanceof Error ? error.message : 'Could not load your calendar.')
      })
      .finally(() => setLoaded(true))
  }, [applyState])

  useEffect(() => {
    if (!loaded || loadError) return
    const state = { events, tags, hiddenTagIds, zoom }
    const fingerprint = calendarFingerprint(state)
    if (fingerprint === persistedCalendar.current) return
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveCalendar(state))
        .then(() => { persistedCalendar.current = fingerprint; setSaveError('') })
        .catch((error) => setSaveError(error instanceof Error ? error.message : 'Could not save.'))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [events, tags, hiddenTagIds, zoom, loaded, loadError])

  useEffect(() => {
    if (tab !== 'calendar' || !loaded || loadError || draft) return
    let cancelled = false, refreshing = false
    const fingerprint = calendarFingerprint({ events, tags, hiddenTagIds, zoom })
    async function refresh() {
      if (refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        await saveQueue.current
        if (cancelled || persistedCalendar.current !== fingerprint) return
        const remote = await loadCalendar({ adopt: false })
        if (cancelled) return
        // Never advance the write revision for a discarded refresh. A local
        // edit cancels this effect and keeps optimistic concurrency intact.
        adoptCalendarRevision(remote.revision)
        if (calendarFingerprint(remote) !== fingerprint) applyState(remote)
      } catch { /* Keep the loaded calendar; writes still check its revision. */ }
      finally { refreshing = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('planner-calendar-refresh',refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh);window.removeEventListener('planner-calendar-refresh',refresh) }
  }, [tab, loaded, loadError, draft, events, tags, hiddenTagIds, zoom, applyState])

  useDatePinch(mainRef, setView, loaded && tab === 'calendar')

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (tab !== 'calendar') return
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        setZoom((current) => clampZoom(current + ZOOM_STEP))
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        setZoom((current) => clampZoom(current - ZOOM_STEP))
      }
      if (event.key === '0') {
        event.preventDefault()
        setZoom(DEFAULT_ZOOM)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab])

  const hiddenSet = useMemo(() => new Set(hiddenTagIds), [hiddenTagIds])
  const visibleEvents = useMemo(() => events.filter(event => isEventVisible(event, hiddenSet)), [events, hiddenSet])
  const range = useMemo(() => visibleRange(cursor, view), [cursor, view])
  const occurrences = useMemo(() => {
    if (view === 'month' || view === 'year') return []
    return expandEvents(visibleEvents, range.start, range.end)
  }, [visibleEvents, view, range.end, range.start])

  function navigate(direction: -1 | 1) {
    if (view === 'year') setCursor(addYears(cursor, direction))
    else if (view === 'month') setCursor(addMonths(cursor, direction))
    else if (view === 'week') setCursor(addDays(cursor, direction * 7))
    else setCursor(addDays(cursor, direction))
  }

  function openCreate(date: Date, options?: { timed?: boolean; allDay?: boolean }) {
    setEditingId(null)
    setDraft(draftFromPreset(date, options))
  }

  function openEdit(event: CalendarEvent) {
    setEditingId(event.id)
    setDraft(draftFromEvent(event))
  }

  function closeModal() {
    setDraft(null)
    setEditingId(null)
  }

  function saveDraft() {
    if (!draft) return
    const saved = eventFromDraft(draft, editingId ?? createId())
    setEvents((current) => {
      const previous=current.find(event=>event.id===saved.id)
      if(previous?.planning)saved.planning={...previous.planning,locked:true}
      const without = current.filter((event) => event.id !== saved.id)
      return [...without, saved]
    })
    closeModal()
  }

  function deleteEvent() {
    if (!editingId) return
    if (!window.confirm('Delete this event? If it repeats, the whole series will be removed.')) return
    setEvents((current) => current.filter((event) => event.id !== editingId))
    closeModal()
  }

  function addTag(tag: Tag) {
    setTags((current) => [...current, tag])
  }

  function deleteTag(id: string) {
    const tag = tags.find((item) => item.id === id)
    if (!tag) return
    if (!window.confirm(`Delete the "${tag.name}" tag? Events stay, but they will no longer use this tag.`)) return
    setTags((current) => current.filter((item) => item.id !== id))
    setHiddenTagIds((current) => current.filter((tagId) => tagId !== id))
    setEvents((current) =>
      current.map((event) => ({ ...event, tagIds: event.tagIds.filter((tagId) => tagId !== id) })),
    )
  }

  function toggleTag(id: string) {
    setHiddenTagIds((current) => (current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]))
  }

  if (!loaded) {
    return (
      <div className="login-screen">
        <p className="quiet">Opening your calendar…</p>
      </div>
    )
  }

  if (loadError) {
    return <div className="login-screen"><div className="login-card"><p role="alert" className="form-error">{loadError}</p><p className="quiet">Your saved calendar has been left intact. Reload before making changes.</p><button type="button" className="primary-btn" onClick={() => window.location.reload()}>Retry loading calendar</button></div></div>
  }

  return (
    <div className="app-shell">
      <Header
        tab={tab}
        onTabChange={setTab}
        cursor={cursor}
        view={view}
        zoom={zoom}
        username={username}
        onViewChange={setView}
        onNavigate={navigate}
        onToday={() => setCursor(new Date())}
        onToggleSidebar={() => {if(tab==='files')setFilesSidebar(v=>!v);else if(tab==='agent')setAgentSidebar(v=>!v);else setSidebarOpen(v=>!v)}}
        onCreate={() => openCreate(cursor)}
        onVisualZoomChange={(value) => setZoom(clampZoom(value))}
        onLogout={() => {
          if (filesUnsaved && !window.confirm('Files has unsaved changes. Discard them and log out?')) return
          const state = { events, tags, hiddenTagIds, zoom }
          const fingerprint = calendarFingerprint(state)
          const unsaved = fingerprint !== persistedCalendar.current
          void saveQueue.current.then(async () => { if (unsaved && fingerprint !== persistedCalendar.current) await saveCalendar(state) }).then(onLogout).catch(() => setSaveError('Could not save your calendar before logging out. Please try again.'))
        }}
      />

      <div className="files-tab-panel" hidden={tab !== 'files'}><FilesView sidebar={filesSidebar} setSidebar={setFilesSidebar} username={username} active={tab === 'files'} onUnsavedChange={setFilesUnsaved} /></div>
      <div className="agent-tab-panel" hidden={tab !== 'agent'}><AgentView username={username} sidebar={agentSidebar} setSidebar={setAgentSidebar} active={tab === 'agent'} /></div>
      {tab==='grok' && <GrokExperiment/>}
      {username==='arin' && <div className="chat-tab-panel" hidden={tab!=='chat'}><ChatExperiment active={tab==='chat'} username={username}/></div>}
      <div className="app-body" hidden={tab !== 'calendar'}>
        <Sidebar
          events={events}
          open={sidebarOpen}
          cursor={cursor}
          onCursorChange={setCursor}
          onCreate={() => openCreate(cursor)}
          tags={tags}
          hiddenTagIds={hiddenSet}
          onToggleTag={toggleTag}
          onAddTag={addTag}
          onUpdateTag={tag=>setTags(current=>current.map(item=>item.id===tag.id?{...item,...tag}:item))}
          onDeleteTag={deleteTag}
        />

        {sidebarOpen && <button type="button" className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}

        <main
          className="calendar-main"
          ref={mainRef}
          style={{ '--zoom': String(zoom) } as CSSProperties}
        >
          {(loadError || saveError) && <p className="save-banner">{loadError || saveError}</p>}
          {view === 'year' ? (
            <YearView
              key={cursor.getFullYear()}
              cursor={cursor}
              events={events}
              tags={tags}
              hiddenTagIds={hiddenSet}
              onMonthOpen={(date) => {
                setCursor(date)
                setView('month')
              }}
              onDayOpen={(date) => {
                setCursor(date)
                setView('day')
              }}
            />
          ) : view === 'month' ? (
            <MonthView
              cursor={cursor}
              zoom={zoom}
              events={visibleEvents}
              onMonthChange={setCursor}
              tags={tags}
              onDayClick={(date) => openCreate(date)}
              onDayOpen={(date) => {
                setCursor(date)
                setView('day')
              }}
              onEventClick={(event) => openEdit(event)}
            />
          ) : (
            <TimeGridView
              active={tab==='calendar'}
              cursor={cursor}
              view={view}
              zoom={zoom}
              occurrences={occurrences}
              tags={tags}
              onSlotClick={(date, allDay) => openCreate(date, { timed: !allDay, allDay })}
              onEventClick={(event) => openEdit(event)}
            />
          )}
        </main>
      </div>

      {draft && (
        <EventModal
          mode={editingId ? 'edit' : 'create'}
          draft={draft}
          tags={tags}
          onChange={setDraft}
          onClose={closeModal}
          onSave={saveDraft}
          onDelete={editingId ? deleteEvent : undefined}
        />
      )}
    </div>
  )
}
