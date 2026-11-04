import type {useCalendarDisplay} from '../lib/useCalendarDisplay'
import {TaskNotificationSettings} from './TaskNotificationSettings'
import {LocalCopySettings} from './LocalCopySettings'
import {downloadCalendarJson} from '../lib/api'
import { useEffect, useState } from 'react'
import { applyTheme, readTheme } from '../lib/theme'
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../lib/zoom'
import { CloseIcon } from './Icons'
import {PlanningSettings} from './PlanningSettings'

type SettingsPanelProps = {
  calendarDisplay:ReturnType<typeof useCalendarDisplay>
  zoom: number
  onZoomChange: (zoom: number) => void
  onClose: () => void
}

function shortcutMod(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
}

export function SettingsPanel({ calendarDisplay, zoom, onZoomChange, onClose }: SettingsPanelProps) {
  const [downloadError,setDownloadError]=useState('')
  const mod = shortcutMod()
  const [theme, setTheme] = useState(readTheme)
  const [planningOpen,setPlanningOpen]=useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape'&&!planningOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose,planningOpen])

  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <div className="settings-head">
        <h2>Settings</h2>
        <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <label className="settings-theme">
        <span>Dark mode</span>
        <input type="checkbox" role="switch" checked={theme === 'dark'} onChange={event => {
          const next = event.target.checked ? 'dark' : 'light'
          setTheme(next)
          applyTheme(next)
        }} />
      </label>
      <button type="button" className="today-btn" onClick={()=>setPlanningOpen(true)}>Planning & intensity</button>
      {planningOpen&&<PlanningSettings onClose={()=>setPlanningOpen(false)}/>}
      <button type="button" className="today-btn" onClick={()=>void downloadCalendarJson().catch(e=>setDownloadError(e.message))}>Download calendar JSON</button>
      <button type="button" className="today-btn" onClick={()=>void downloadCalendarJson(true).catch(e=>setDownloadError(e.message))}>Download staging JSON</button>
      {downloadError&&<p className="form-error" role="alert">{downloadError}</p>}
      <fieldset className="settings-duration"><legend>Scale to duration</legend>
        <label className="settings-theme"><span>Week view</span><input type="checkbox" role="switch" aria-label="Scale week view to duration" checked={calendarDisplay.settings.week} disabled={calendarDisplay.saving} onChange={e=>void calendarDisplay.change('week',e.target.checked)}/></label>
        <label className="settings-theme"><span>Month view</span><input type="checkbox" role="switch" aria-label="Scale month view to duration" checked={calendarDisplay.settings.month} disabled={calendarDisplay.saving} onChange={e=>void calendarDisplay.change('month',e.target.checked)}/></label>
        <p className="quiet">Size timed events and folders by their duration. Short events keep a minimum tappable height. Saved to your account.</p>
        {calendarDisplay.error&&<p role="alert" className="form-error">{calendarDisplay.error}</p>}
      </fieldset>
      <TaskNotificationSettings/>
      <LocalCopySettings/>
      <label className="settings-field">
        <span>Display size</span>
        <div className="settings-zoom-row">
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
          <strong>{Math.round(zoom * 100)}%</strong>
        </div>
      </label>
      <button type="button" className="text-btn" onClick={() => onZoomChange(DEFAULT_ZOOM)}>
        Reset to 100%
      </button>
      <p className="quiet settings-hint">
        Visual zoom: {mod} + / {mod} −. Reset with {mod} 0.
      </p>
    </div>
  )
}
