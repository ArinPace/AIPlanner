import {useMultiDayCount} from '../lib/useMultiDayCount'
import {CalendarHistory} from './CalendarHistory'
import {NoteIcon} from './NoteIcons'
import {createPortal} from 'react-dom'
import {MiniCalendar} from './MiniCalendar'
import {isToday,isSameMonth,isSameYear,addDays} from '../lib/dates'
import {PlannerDate as Date} from '../lib/timezone'
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
  onDateChange: (date:Date)=>void
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
  onDateChange,
  onToggleSidebar,
  onCreate,
  onVisualZoomChange,
  onLogout,
  calendarDisplay,
}: HeaderProps) {
  const now=new Date()
  const multiDayCount=useMultiDayCount()
  const currentPeriod=view==='day'?isToday(cursor):view==='week'?isToday(cursor):view==='month'?isSameMonth(cursor,now):isSameYear(cursor,now)
  const weekStart=cursor,weekEnd=addDays(cursor,multiDayCount-1)
  const weekLabel=weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'–'+weekEnd.toLocaleDateString('en-US',isSameMonth(weekStart,weekEnd)?{day:'numeric'}:{month:'short',day:'numeric'})
  const periodLabel=currentPeriod?({day:'Today',week:'Today',month:'This month',year:'This year'}[view]):view==='day'?cursor.toLocaleDateString('en-US',{month:'short',day:'numeric'}):view==='month'?cursor.toLocaleDateString('en-US',{month:'short',year:'numeric'}):view==='year'?String(cursor.getFullYear()):weekLabel
  const [historyOpen,setHistoryOpen]=useState(false)
  const pickerRef=useRef<HTMLDialogElement>(null)
  const dateButton=useRef<HTMLButtonElement>(null)
  const [pickerMonth,setPickerMonth]=useState(cursor)
  function openDatePicker(){setPickerMonth(cursor);pickerRef.current?.showModal()}
  function closeDatePicker(){pickerRef.current?.close();dateButton.current?.focus()}
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{const handle=(event:Event)=>{const open=(event as CustomEvent).detail?.open;if(typeof open==='boolean')setSettingsOpen(open)};window.addEventListener('planner-client-settings',handle);return()=>window.removeEventListener('planner-client-settings',handle)},[])


  useEffect(() => {
    if (!settingsOpen) return
    function onPointer(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node) && !(event.target instanceof Element && event.target.closest('.settings-panel'))) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [settingsOpen])

  return (
    <header hidden={tab !== 'calendar'} className={'app-header'+(tab === 'calendar' ? ' is-calendar' : '')}>
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
        <button ref={dateButton} type="button" className="today-btn" aria-label={'Choose date: '+cursor.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} aria-haspopup="dialog" onClick={openDatePicker}>{periodLabel}</button>
        <button type="button" className="icon-btn" aria-label="Next" onClick={() => onNavigate(1)}><ChevronIcon className="flip" /></button>
        </div>}
      </div>

      <div className="header-center" hidden={view === 'day'}>

        {tab === 'calendar' && <>

        <h1 className="range-title">{view==='week'?weekLabel+', '+weekEnd.getFullYear():formatRangeLabel(cursor, view)}</h1><span className="calendar-timezone" title="America/New_York ? adjusts for daylight saving">New York (ET)</span>
        </>}
      </div>

      <div className="header-right">
        {!hideAgent&&<button type="button" className={'header-agent-button'+(tab==='agent'?' is-active':'')} aria-current={tab==='agent'?'page':undefined} onClick={()=>onTabChange('agent')}>Agent</button>}
        <button type="button" className="icon-btn header-calendar-history" aria-label="Calendar history" title="Calendar history" aria-haspopup="dialog" onClick={()=>setHistoryOpen(true)}><NoteIcon name="history" size={20}/></button>
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
          {settingsOpen && (tab==='calendar'?<SettingsPanel
              calendarDisplay={calendarDisplay}
              zoom={zoom}
              onLogout={onLogout}
              onZoomChange={onVisualZoomChange}
              onClose={() => setSettingsOpen(false)}
            />:createPortal(<div className="note-settings-host"><SettingsPanel
              calendarDisplay={calendarDisplay}
              zoom={zoom}
              onLogout={onLogout}
              onZoomChange={onVisualZoomChange}
              onClose={() => setSettingsOpen(false)}
            /></div>,document.body))}
        </div>
        <div className="user-chip">
          <span>{username}</span>
        </div>
      </div>
      {historyOpen&&<CalendarHistory onClose={()=>setHistoryOpen(false)}/>}
      <dialog ref={pickerRef} className="header-date-picker" aria-label="Choose calendar date" onCancel={event=>{event.preventDefault();closeDatePicker()}} onClick={event=>{if(event.target===pickerRef.current){const rect=pickerRef.current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDatePicker()}}}>
        <MiniCalendar cursor={pickerMonth} selectedDate={cursor} onMonthChange={setPickerMonth} onCursorChange={date=>{onDateChange(date);closeDatePicker()}}/>
        <div className="header-date-picker-actions"><button type="button" className="text-btn" onClick={()=>{onToday();closeDatePicker()}}>Go to today</button><button type="button" className="text-btn" onClick={closeDatePicker}>Close</button></div>
      </dialog>
    </header>
  )
}
