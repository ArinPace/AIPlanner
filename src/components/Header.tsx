import { useEffect, useRef, useState } from 'react'
import type { CalendarView } from '../types'
import { formatRangeLabel } from '../lib/dates'
import { SettingsPanel } from './SettingsPanel'
import {CalendarHistory} from './CalendarHistory'
import { CalendarMark, ChevronIcon, MenuIcon, PlusIcon, SettingsIcon } from './Icons'

type HeaderProps = {
  tab: 'calendar' | 'files' | 'agent' | 'grok' | 'chat'
  onTabChange: (tab: 'calendar' | 'files' | 'agent' | 'grok' | 'chat') => void
  cursor: Date
  view: CalendarView
  zoom: number
  username: string
  onViewChange: (view: CalendarView) => void
  onNavigate: (direction: -1 | 1) => void
  onToday: () => void
  onToggleSidebar: () => void
  onCreate: () => void
  onVisualZoomChange: (zoom: number) => void
  onLogout: () => void
}

const VIEWS: CalendarView[] = ['day', 'week', 'month', 'year']

export function Header({
  tab,
  onTabChange,
  cursor,
  view,
  zoom,
  username,
  onViewChange,
  onNavigate,
  onToday,
  onToggleSidebar,
  onCreate,
  onVisualZoomChange,
  onLogout,
}: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen,setHistoryOpen]=useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

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
    <header className="app-header">
      <div className="header-left">
        <button type="button" className="icon-btn menu-btn" title="Show or hide sidebar" aria-label="Toggle sidebar" onClick={onToggleSidebar}>
          <MenuIcon />
        </button>
        <div className="brand">
          <CalendarMark />
          <span>AI Planner</span>
        </div>
        <button type="button" hidden={tab !== 'calendar'} className="create-btn mobile-only" onClick={onCreate}>
          <PlusIcon />
          Create
        </button>
      </div>

      <div className="header-center">
        <nav className="workspace-tabs" aria-label="Workspace"><button type="button" aria-current={tab === 'calendar' ? 'page' : undefined} className={tab === 'calendar' ? 'is-active' : ''} onClick={() => onTabChange('calendar')}>Calendar</button><button type="button" aria-current={tab === 'files' ? 'page' : undefined} className={tab === 'files' ? 'is-active' : ''} onClick={() => onTabChange('files')}>Files</button><button type="button" aria-current={tab === 'agent' ? 'page' : undefined} className={tab === 'agent' ? 'is-active' : ''} onClick={() => onTabChange('agent')}>Agent</button><button type="button" aria-current={tab === 'grok' ? 'page' : undefined} className={tab === 'grok' ? 'is-active' : ''} onClick={() => onTabChange('grok')}>Grok</button>{username==='arin'&&<button type="button" aria-current={tab === 'chat' ? 'page' : undefined} className={tab === 'chat' ? 'is-active' : ''} onClick={() => onTabChange('chat')}>Chat</button>}</nav>
        {tab === 'calendar' && <>

        <button type="button" className="today-btn" onClick={onToday}>
          Today
        </button>
        <button type="button" className="icon-btn" aria-label="Calendar history" title="Calendar history" onClick={()=>setHistoryOpen(true)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/></svg></button>
        <div className="nav-group">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => onNavigate(-1)}>
            <ChevronIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => onNavigate(1)}>
            <ChevronIcon className="flip" />
          </button>
        </div>
        <h1 className="range-title">{formatRangeLabel(cursor, view)}</h1><span className="calendar-timezone" title="America/New_York ? adjusts for daylight saving">New York (ET)</span>
        </>}
      </div>

      <div className="header-right">
        {tab === 'calendar' && <div className="view-switch" role="tablist" aria-label="Calendar view">
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              className={view === option ? 'is-active' : ''}
              onClick={() => onViewChange(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>}
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
              zoom={zoom}
              onZoomChange={onVisualZoomChange}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
        <div className="user-chip">
          <span>{username}</span>
          <button type="button" className="text-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    {historyOpen&&<CalendarHistory onClose={()=>setHistoryOpen(false)}/>}
    </header>
  )
}
