import type {useCalendarDisplay} from '../lib/useCalendarDisplay'
import { useEffect, useRef, useState } from 'react'
import type { CalendarView } from '../types'
import { formatRangeLabel } from '../lib/dates'
import { SettingsPanel } from './SettingsPanel'
import { CalendarMark, ChevronIcon, MenuIcon, PlusIcon, SettingsIcon } from './Icons'

type HeaderProps = {
  hideAgent?:boolean
  calendarDisplay:ReturnType<typeof useCalendarDisplay>
  tab: 'calendar' | 'files' | 'todo' | 'work' | 'agent' | 'screentime' | 'chat'
  onTabChange: (tab: 'calendar' | 'files' | 'todo' | 'work' | 'agent' | 'screentime' | 'chat') => void
  cursor: Date
  view: CalendarView
  zoom: number
  username: string
  onNavigate: (direction: -1 | 1) => void
  onToday: () => void
  onToggleSidebar: () => void
  onCreate: () => void
  onVisualZoomChange: (zoom: number) => void
  onLogout: () => void
}

export function Header({
  hideAgent=false,
  tab,
  onTabChange,
  cursor,
  view,
  zoom,
  username,
  onNavigate,
  onToday,
  onToggleSidebar,
  onCreate,
  onVisualZoomChange,
  onLogout,
  calendarDisplay,
}: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{const handle=(event:Event)=>{const open=(event as CustomEvent).detail?.open;if(typeof open==='boolean')setSettingsOpen(open)};window.addEventListener('planner-client-settings',handle);return()=>window.removeEventListener('planner-client-settings',handle)},[])


  useEffect(() => {
    if (!settingsOpen) return
    function onPointer(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [settingsOpen])

  return (
    <header className={'app-header'+(tab === 'calendar' ? ' is-calendar' : '')}>
      <div className="header-left">
        <button type="button" hidden={tab==='todo'||tab==='work'||tab==='screentime'} className="icon-btn menu-btn" title="Show or hide sidebar" aria-label="Toggle sidebar" onClick={onToggleSidebar}>
          <MenuIcon />
        </button>
        <div className="brand">
          <CalendarMark />
          <span>AI Planner</span>
        </div>
        <button type="button" hidden={tab !== 'calendar'} className="create-btn mobile-only" aria-label="Create event" title="Create event" onClick={onCreate}>
          <PlusIcon />
        </button>
        {tab === 'calendar' && <div className="calendar-navigation">
        <button type="button" className="icon-btn" aria-label="Previous" onClick={() => onNavigate(-1)}><ChevronIcon /></button>
        <button type="button" className="today-btn" onClick={onToday}>Today</button>
        <button type="button" className="icon-btn" aria-label="Next" onClick={() => onNavigate(1)}><ChevronIcon className="flip" /></button>
        </div>}
      </div>

      <div className="header-center">
        <nav className="workspace-tabs" aria-label="Workspace"><button type="button" aria-current={tab === 'calendar' ? 'page' : undefined} className={tab === 'calendar' ? 'is-active' : ''} onClick={() => onTabChange('calendar')}>Calendar</button><button hidden type="button" aria-current={tab === 'files' ? 'page' : undefined} className={tab === 'files' ? 'is-active' : ''} onClick={() => onTabChange('files')}>Files</button><button type="button" aria-current={tab === 'todo' ? 'page' : undefined} className={tab === 'todo' ? 'is-active' : ''} onClick={() => onTabChange('todo')}>To-do</button><button type="button" aria-current={tab === 'work' ? 'page' : undefined} className={tab === 'work' ? 'is-active' : ''} onClick={() => onTabChange('work')}>Work</button><button hidden={hideAgent} type="button" aria-current={tab === 'agent' ? 'page' : undefined} className={tab === 'agent' ? 'is-active' : ''} onClick={() => onTabChange('agent')}>Agent</button>{<button type="button" aria-current={tab==='screentime'?'page':undefined} className={tab==='screentime'?'is-active':''} onClick={()=>onTabChange('screentime')}>Screen Time</button>}{<button hidden type="button" aria-current={tab === 'chat' ? 'page' : undefined} className={tab === 'chat' ? 'is-active' : ''} onClick={() => onTabChange('chat')}>Chat</button>}</nav>
        {tab === 'calendar' && <>

        <h1 className="range-title">{formatRangeLabel(cursor, view)}</h1><span className="calendar-timezone" title="America/New_York ? adjusts for daylight saving">New York (ET)</span>
        </>}
      </div>

      <div className="header-right">
        <div className="settings-wrap" ref={settingsRef}>
          <button
            type="button"
            className={`icon-btn ${settingsOpen ? 'is-active' : ''}`}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <SettingsIcon />
          </button>
          {settingsOpen && (
            <SettingsPanel
              calendarDisplay={calendarDisplay}
              zoom={zoom}
              onLogout={onLogout}
              onZoomChange={onVisualZoomChange}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
        <div className="user-chip">
          <span>{username}</span>
        </div>
      </div>
    </header>
  )
}
