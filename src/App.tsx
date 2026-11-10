import {completeCalendarBlock} from './lib/api'
import {DeviceControlSync} from './components/DeviceControlSync'
import {subscriptionChatRequest} from './lib/api'
import {applyTheme,readTheme} from './lib/theme'
import {useCalendarDisplay} from './lib/useCalendarDisplay'
import {SubscriptionChatView} from './components/SubscriptionChatView'
import {TaskNotificationSync} from './components/TaskNotificationSync'
import {taskScreenTimeWindow} from './lib/taskScreenTime'
import {verifyFreeTimeRequest, type TaskFeedback, type TaskTimeResult} from './lib/widgetTaskFeedback'
import {WidgetTaskFeedback} from './components/WidgetTaskFeedback'
import {ScreenTimePanel} from './components/ScreenTimePanel'
import {RECOVERY_TAB} from './lib/attachmentRecovery'
import { PlannerDate as Date } from './lib/timezone.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FilesView } from './components/FilesView'
import { AgentView } from './components/AgentView'
import { EventModal } from './components/EventModal'
import { Header } from './components/Header'
import { LoginScreen } from './components/LoginScreen'
import { MonthView } from './components/MonthView'
import { Sidebar } from './components/Sidebar'
import { TimeGridView } from './components/TimeGridView'
import { YearView } from './components/YearView'
import { adoptCalendarRevision, emptyCalendar, getSession, getToken, loadCalendar, loadFiles, logout, saveCalendar, setToken } from './lib/api'
import { isEventVisible } from './lib/colors'
import {eventType,type ScheduleType} from './lib/eventType'
import {saveEventGroup,removeEventSeries,detachEventOccurrence} from './lib/eventFolders'
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
    scheduleType:'fixed',
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
    eventKind:event.eventKind,
    scheduleType:eventType(event),
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
    eventKind:draft.eventKind,
    scheduleType:draft.scheduleType||'fixed',
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
      ...(draft.recurrence.frequency==='custom'?{...(draft.recurrence.customMode==='monthdates'?{customMode:'monthdates' as const,monthDays:[...new Set(draft.recurrence.monthDays||[])].sort((a,b)=>a-b)}:{weekdays:[...new Set(draft.recurrence.weekdays||[])].sort(),...(draft.recurrence.weekStartsOn===undefined?{}:{weekStartsOn:draft.recurrence.weekStartsOn})})}:{}),
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
      key={username}
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
  const calendarDisplay=useCalendarDisplay(username)
  const [tab, setTab] = useState<'calendar' | 'files' | 'todo' | 'work' | 'agent' | 'screentime' | 'chat'>(()=>sessionStorage.getItem(RECOVERY_TAB)===username?'agent':'calendar')
  const [hideAgent,setHideAgent]=useState(false)
  useEffect(()=>{let live=true;void subscriptionChatRequest<{agentHidden:boolean}>(undefined,{action:'schedule_read'}).then(value=>{if(live&&value)setHideAgent(value.agentHidden===true)}).catch(()=>{});return()=>{live=false}},[username])
  useVmActivity(username,!hideAgent&&tab!=='chat')
  const [todoRequest,setTodoRequest]=useState(0)
  const [filesUnsaved, setFilesUnsaved] = useState(false)
  const fileDirty=useRef({files:false,todo:false,work:false})
  const fileDirtyHandlers=useMemo(()=>Object.fromEntries((['files','todo','work'] as const).map(key=>[key,(value:boolean)=>{fileDirty.current[key]=value;setFilesUnsaved(Object.values(fileDirty.current).some(Boolean))}])) as Record<'files'|'todo'|'work',(value:boolean)=>void>,[])
  const [visitedNotes,setVisitedNotes]=useState({todo:false,work:false})
  useEffect(()=>{if(tab==='todo'||tab==='work')setVisitedNotes(previous=>previous[tab]?previous:{...previous,[tab]:true})},[tab])
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>('week')
  const [filesSidebar,setFilesSidebar]=useState(()=>window.innerWidth>600)
  const [subscriptionSidebar,setSubscriptionSidebar]=useState(()=>window.innerWidth>700)
  const [agentSidebar,setAgentSidebar]=useState(()=>window.innerWidth>700)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 861px)').matches)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [hiddenTagIds, setHiddenTagIds] = useState<string[]>([])
  const [hiddenTypes,setHiddenTypes]=useState<ScheduleType[]>(()=>{try{return JSON.parse(localStorage.getItem('planner-event-types:'+username)||'[]').filter((type:unknown)=>type==='fixed'||type==='planned')}catch{return []}})
  function toggleEventType(type:ScheduleType){setHiddenTypes(current=>{const next=current.includes(type)?current.filter(value=>value!==type):[...current,type];try{localStorage.setItem('planner-event-types:'+username,JSON.stringify(next))}catch{/* Keep the filter working when browser storage is unavailable. */}return next})}
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingOccurrence,setEditingOccurrence]=useState<string|null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const mainRef = useRef<HTMLElement>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const persistedCalendar = useRef('')
  const [widgetSaving,setWidgetSaving]=useState(false)
  const latestCalendar=useRef({events,tags,hiddenTagIds,zoom,loaded,draft})
  useLayoutEffect(()=>{latestCalendar.current={events,tags,hiddenTagIds,zoom,loaded,draft}},[events,tags,hiddenTagIds,zoom,loaded,draft])

  const clientUI=useRef({tab,view,date:cursor.toISOString(),filesUnsaved,calendarEditorOpen:Boolean(draft),loaded})
  useLayoutEffect(()=>{clientUI.current={tab,view,date:cursor.toISOString(),filesUnsaved,calendarEditorOpen:Boolean(draft),loaded}},[tab,view,cursor,filesUnsaved,draft,loaded])
  useEffect(()=>{
    const handle=(event:Event)=>{const d=(event as CustomEvent).detail;if(!d||typeof d.resolve!=='function'||typeof d.reject!=='function')return
      try{
        if(d.account!==username)throw Error('Your account changed. No UI action was applied.')
        const c=d.command
        if(c.action==='ui_read'){d.resolve({...clientUI.current,theme:readTheme(),zoom,hiddenTypes});return}
        if(c.action==='ui_preferences'){
          if(c.expected.theme!==readTheme()||c.expected.zoom!==zoom||JSON.stringify([...c.expected.hiddenTypes].sort())!==JSON.stringify([...hiddenTypes].sort()))throw Error('UI preferences changed. Read them before editing.')
          if(c.theme)applyTheme(c.theme)
          if(c.zoom!==undefined)setZoom(clampZoom(c.zoom))
          if(c.hiddenTypes){setHiddenTypes(c.hiddenTypes);localStorage.setItem('planner-event-types:'+username,JSON.stringify(c.hiddenTypes))}
        }else if(c.action==='ui_settings'){window.dispatchEvent(new CustomEvent('planner-client-settings',{detail:{open:c.open}}))}
        else if(c.action==='ui_navigate'){
          if((filesUnsaved||draft)&&c.tab!==tab)throw Error('Finish unsaved note/calendar edits before changing tabs.')
          if(c.tab==='agent'&&hideAgent)throw Error('Agent is hidden for this test account. Use Chat.')
          const date=c.date?new Date(c.date+'T12:00:00'):null
          if(date&&(!Number.isFinite(date.getTime())||date.getFullYear()!==Number(c.date.slice(0,4))||date.getMonth()+1!==Number(c.date.slice(5,7))||date.getDate()!==Number(c.date.slice(8,10))))throw Error('Invalid calendar date.')
          setTab(c.tab);if(c.tab==='todo'||c.tab==='work')setTodoRequest(n=>n+1)
          if(c.view)setView(c.view)
          if(date)setCursor(date)
        }else throw Error('Unknown Planner UI action.')
        requestAnimationFrame(()=>requestAnimationFrame(()=>d.resolve({...clientUI.current,theme:readTheme(),...(c.action==='ui_preferences'?{zoom:c.zoom??zoom,hiddenTypes:c.hiddenTypes??hiddenTypes}:{}),...(c.action==='ui_settings'?{settingsOpen:c.open}:{})})))
      }catch(error){d.reject(error)}
    }
    window.addEventListener('planner-client-ui',handle);return()=>window.removeEventListener('planner-client-ui',handle)
  },[username,filesUnsaved,draft,tab,zoom,hiddenTypes,hideAgent])

  const applyState = useCallback((state: StoredState) => {
    persistedCalendar.current = calendarFingerprint(state)
    setEvents(state.events)
    setTags(state.tags)
    setHiddenTagIds(state.hiddenTagIds)
    setZoom(clampZoom(state.zoom ?? DEFAULT_ZOOM))
  }, [])

  const applyWidgetTime=useCallback(async(feedback:TaskFeedback):Promise<TaskTimeResult>=>{
    const accountToken=getToken()
    setWidgetSaving(true)
    try {
      const operation=saveQueue.current.then(async()=>{
        const local=latestCalendar.current
        if(!local.loaded||local.draft||calendarFingerprint(local)!==persistedCalendar.current)throw new Error('Finish editing or saving your calendar, then retry this request.')
        if(accountToken!==getToken())throw new Error('Your account changed.')
        const remote=await loadCalendar()
        if(accountToken!==getToken())throw new Error('Your account changed.')
        if(feedback.kind==='fillFreeTime'){
          const result=verifyFreeTimeRequest(remote.events,remote.tags,feedback)
          applyState(remote)
          return result
        }
        applyState(remote)
        const end=new globalThis.Date((feedback.done?feedback.reportedAt:feedback.requestedEnd??feedback.reportedAt+feedback.remainingMinutes*60)*1000).toISOString()
        return {applied:false,end,note:'Widget-only preview. The live calendar has NOT been changed. Prepare the complete revised schedule in a draft and publish it atomically only after full review.'}

      })
      saveQueue.current=operation.then(()=>undefined,()=>undefined)
      return await operation
    }finally{setWidgetSaving(false)}
  },[applyState])

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
    if (!loaded || loadError || draft) return
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
    const timer = window.setInterval(() => void refresh(), tab==='calendar'?15000:60000)
    const resume=()=>{if(document.visibilityState==='visible')void refresh()}
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange',resume)
    window.addEventListener('planner-calendar-refresh',refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh);document.removeEventListener('visibilitychange',resume);window.removeEventListener('planner-calendar-refresh',refresh) }
  }, [tab, loaded, loadError, draft, events, tags, hiddenTagIds, zoom, applyState])

  async function markCalendarDone(event:CalendarEvent,start:Date){
    if(draft)throw new Error('Close the event editor before marking work done.')
    await saveQueue.current
    const baseline=calendarFingerprint(latestCalendar.current)
    if(baseline!==persistedCalendar.current)throw new Error('Calendar changes are still saving. Try again in a moment.')
    const current=await loadCalendar({adopt:false})
    const result=await completeCalendarBlock({revision:current.revision!,eventId:event.id,occurrenceStart:start.toISOString()})
    const remote=await loadCalendar({adopt:false})
    if(calendarFingerprint(latestCalendar.current)===baseline){adoptCalendarRevision(remote.revision);applyState(remote)}
    else setSaveError('Completion saved. You also edited the calendar; reconcile those edits before saving again.')
    const open=result.progress.filter(item=>!item.checked)
    return open.length?'Block saved. '+open.map(item=>item.blocked?'Additional required work is not yet fully mapped.':item.recurring?'Recurring checklist stays open.':`${item.completed} of ${item.total} required blocks done.`).join(' '):'Block saved and linked checklist item checked off.'
  }

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

  const lastLocalFilesSync=useRef(0)
  useEffect(()=>{
    if(!loaded||loadError||['files','todo','work'].includes(tab))return
    let fetching=false
    const sync=()=>{
      if(document.visibilityState==='hidden'||fetching||globalThis.Date.now()-lastLocalFilesSync.current<300000)return
      fetching=true
      void loadFiles().then(()=>{lastLocalFilesSync.current=globalThis.Date.now()}).catch(()=>{}).finally(()=>{fetching=false})
    }
    sync();const timer=window.setInterval(sync,60000)
    window.addEventListener('focus',sync)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',sync)}
  },[loaded,loadError,tab])

  const hiddenSet = useMemo(() => new Set(hiddenTagIds), [hiddenTagIds])
  const visibleEvents = useMemo(() => events.filter(event => isEventVisible(event, hiddenSet)&&!hiddenTypes.includes(eventType(event,tags))), [events, hiddenSet,hiddenTypes,tags])
  const range = useMemo(() => visibleRange(cursor, view), [cursor, view])
  const occurrences = useMemo(() => {
    if (view === 'month' || view === 'year') return []
    return expandEvents(visibleEvents, range.start, range.end)
  }, [visibleEvents, view, range.end, range.start])

  const busyOccurrences = useMemo(() => {
    if (view === 'month' || view === 'year') return []
    return expandEvents(events, range.start, range.end)
  }, [events, view, range.end, range.start])

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

  function openEdit(event: CalendarEvent,occurrenceStart?: Date,sourceEvents=events) {
    setEditingOccurrence((occurrenceStart||new Date(event.start)).toISOString())
    setEditingId(event.id)
    function tree(item:CalendarEvent):EventDraft{return {...draftFromEvent(item),...(item.eventKind==='folder'?{folderChildren:sourceEvents.filter(child=>child.folderId===item.id).map(child=>({id:child.id,draft:tree(child)}))}:{})}}
    setDraft(tree(event))
  }

  function closeModal() {
    setDraft(null)
    setEditingId(null)
  }

  function saveDraft() {
    if (!draft) return
    const converting=draft.eventKind==='folder'&&editingId&&events.find(event=>event.id===editingId)?.eventKind!=='folder'
    const saved = eventFromDraft(draft, converting?createId():editingId??createId())
    if(converting)saved.folderId=events.find(event=>event.id===editingId)?.folderId||null
    function flatten(value:EventDraft,parentId:string):CalendarEvent[]{return (value.folderChildren||[]).flatMap(child=>[{...eventFromDraft(child.draft,child.id),folderId:parentId},...(child.draft.eventKind==='folder'?flatten(child.draft,child.id):[])])}
    const children=draft.eventKind==='folder'?flatten(draft,saved.id):undefined
    setEvents(saveEventGroup(events,saved,children))
    closeModal()
  }

  function detachOccurrence(){
    if(!editingId||!editingOccurrence)return
    if(!window.confirm('Remove this occurrence from the repeating series? It and its contents will remain on the calendar as standalone items you can edit or delete.'))return
    const detached=detachEventOccurrence(events,editingId,editingOccurrence)
    setEvents(detached.events)
    openEdit(detached.event,new Date(detached.event.start),detached.events)
  }

  function deleteEvent() {
    if (!editingId) return
    const selected=events.find(event=>event.id===editingId)
    if (!window.confirm(selected?.eventKind==='folder'?(selected.recurrence.frequency!=='none'?'Delete this recurring folder and all events and nested folders inside it for every date?':selected.detachedFrom?'Delete this standalone folder and all events inside it?':'Delete this folder? Its events will stay on the calendar.'):'Delete this event? If it repeats, the whole series will be removed.')) return
    setEvents((current) => removeEventSeries(current,[editingId]))
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
    <div className="app-shell" inert={widgetSaving}>
      <TaskNotificationSync username={username} calendar={{events,tags,hiddenTagIds,zoom}}/>
      <WidgetTaskFeedback username={username} onApply={applyWidgetTime}/>
      <DeviceControlSync username={username}/>
      <Header hideAgent={hideAgent}
        tab={tab}
        onTabChange={next=>{if(next==='todo'||next==='work')setTodoRequest(n=>n+1);setTab(next)}}
        cursor={cursor}
        view={view}
        zoom={zoom}
        calendarDisplay={calendarDisplay}
        username={username}
        onViewChange={setView}
        onNavigate={navigate}
        onToday={() => setCursor(new Date())}
        onToggleSidebar={() => {if(tab==='files'||tab==='todo'||tab==='work')setFilesSidebar(v=>!v);else if(tab==='agent')setAgentSidebar(v=>!v);else if(tab==='chat')setSubscriptionSidebar(v=>!v);else setSidebarOpen(v=>!v)}}
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

      <div className="files-tab-panel" hidden={tab!=='files'}><FilesView sidebar={filesSidebar} setSidebar={setFilesSidebar} username={username} active={tab==='files'} onUnsavedChange={fileDirtyHandlers.files}/></div>
      {(visitedNotes.todo||tab==='todo')&&<div className="files-tab-panel" hidden={tab!=='todo'}><FilesView standaloneTodo sidebar={false} setSidebar={setFilesSidebar} username={username} active={tab==='todo'} todoRequest={todoRequest||1} onUnsavedChange={fileDirtyHandlers.todo}/></div>}
      {(visitedNotes.work||tab==='work')&&<div className="files-tab-panel" hidden={tab!=='work'}><FilesView standaloneTodo workMode sidebar={false} setSidebar={setFilesSidebar} username={username} active={tab==='work'} todoRequest={todoRequest||1} onUnsavedChange={fileDirtyHandlers.work}/></div>}
      {tab==='screentime' && <ScreenTimePanel/>}
      {!hideAgent&&<div className="agent-tab-panel" hidden={tab !== 'agent'}><AgentView username={username} sidebar={agentSidebar} setSidebar={setAgentSidebar} active={tab === 'agent'} /></div>}
      <div className="agent-tab-panel" hidden={tab!=='chat'}><SubscriptionChatView active={tab==='chat'} username={username} sidebar={subscriptionSidebar} setSidebar={setSubscriptionSidebar}/></div>
      <div className="app-body" hidden={tab !== 'calendar'}>
        <Sidebar
          events={events}
          open={sidebarOpen}
          cursor={cursor}
          onCursorChange={setCursor}
          onCreate={() => openCreate(cursor)}
          tags={tags}
          hiddenTagIds={hiddenSet}
          hiddenTypes={hiddenTypes}
          onToggleType={toggleEventType}
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
              events={visibleEvents}
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
              scaleToDuration={calendarDisplay.settings.month}
              cursor={cursor}
              zoom={zoom}
              events={visibleEvents}
              busyEvents={events}
              onMonthChange={setCursor}
              tags={tags}
              onDayClick={(date) => openCreate(date)}
              onDayOpen={(date) => {
                setCursor(date)
                setView('day')
              }}
              onEventClick={(event,start) => openEdit(event,start)}
            />
          ) : (
            <TimeGridView
              scaleToDuration={calendarDisplay.settings.week}
              onEventDone={markCalendarDone}
              active={tab==='calendar'}
              cursor={cursor}
              view={view}
              zoom={zoom}
              occurrences={occurrences}
              busyOccurrences={busyOccurrences}
              tags={tags}
              onSlotClick={(date, allDay) => openCreate(date, { timed: !allDay, allDay })}
              onEventClick={(event,start) => openEdit(event,start)}
            />
          )}
        </main>
      </div>

      {draft && (
        <EventModal
          screenTimeTask={(()=>{const event=events.find(event=>event.id===editingId);if(!event||event.allDay||event.reminder||!editingOccurrence)return undefined;const start=new Date(editingOccurrence);return taskScreenTimeWindow(event,start,new Date(start.getTime()+new Date(event.end).getTime()-new Date(event.start).getTime()))})()}
          existingId={editingId||undefined}
          nested={Boolean(editingId&&events.find(event=>event.id===editingId)?.folderId)}
          mode={editingId ? 'edit' : 'create'}
          draft={draft}
          tags={tags}
          onChange={setDraft}
          onClose={closeModal}
          onSave={saveDraft}
          onDeleteOccurrence={editingId && events.find(event=>event.id===editingId)?.recurrence.frequency!=='none' ? detachOccurrence:undefined}
          onDelete={editingId ? deleteEvent : undefined}
        />
      )}
    </div>
  )
}
