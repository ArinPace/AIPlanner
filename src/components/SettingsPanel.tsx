import { useEffect, useState } from 'react'
import { applyTheme, readTheme } from '../lib/theme'
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../lib/zoom'
import { CloseIcon } from './Icons'

type SettingsPanelProps = {
  zoom: number
  onZoomChange: (zoom: number) => void
  onClose: () => void
}

function shortcutMod(): string {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
}

export function SettingsPanel({ zoom, onZoomChange, onClose }: SettingsPanelProps) {
  const mod = shortcutMod()
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
