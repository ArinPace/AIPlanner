import { urgencyColor } from '../lib/urgencyColor'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { EventDraft, RecurrenceFrequency, Tag } from '../types'
import { contrastText } from '../lib/colors'
import { recurrenceLabel } from '../lib/recurrence'
import { CloseIcon, TrashIcon } from './Icons'

type EventModalProps = {
  mode: 'create' | 'edit'
  draft: EventDraft
  tags: Tag[]
  onChange: (draft: EventDraft) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const INTERVAL_UNITS: Record<Exclude<RecurrenceFrequency, 'none'>, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
}

export function EventModal({ mode, draft, tags, onChange, onClose, onSave, onDelete }: EventModalProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const accent = tags.find((tag) => draft.tagIds.includes(tag.id))?.color ?? '#1a73e8'

  useEffect(() => {
    titleRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function update<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) {
      setError('Add a title for this event.')
      titleRef.current?.focus()
      return
    }
    if (!draft.reminder && draft.endDate < draft.date) {
      setError('The end date must be on or after the start date.')
      return
    }
    if (!draft.reminder && !draft.allDay && draft.date === draft.endDate && draft.endTime <= draft.startTime) {
      setError('The end time must be after the start time.')
      return
    }
    setError('')
    onSave()
  }

  function toggleTag(id: string) {
    update(
      'tagIds',
      draft.tagIds.includes(id) ? draft.tagIds.filter((tagId) => tagId !== id) : [...draft.tagIds, id],
    )
  }

  const frequency = draft.recurrence.frequency
  const repeating = frequency !== 'none'
  const unit = frequency === 'none' ? ['day', 'days'] : INTERVAL_UNITS[frequency]

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="event-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-accent" style={{ background: accent }} />
        <div className="modal-top">
          <input
            ref={titleRef}
            className="title-input"
            value={draft.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="Add title"
            maxLength={120}
          />
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <label className="field"><span>Type</span><select aria-label="Event type" value={draft.reminder?'reminder':'event'} onChange={e=>onChange({...draft,reminder:e.target.value==='reminder',endDate:draft.date})}><option value="event">Event</option><option value="reminder">Reminder</option></select></label>
        {draft.reminder && <p className="quiet">A deadline or reminder with no duration. Choose a time, or leave it in the all-day row.</p>}
        <label className="field event-urgency-field">
          <span>Urgency <small>(optional)</small></span>
          <input type="number" aria-label="Event urgency" style={urgencyColor(draft.urgency)} min="0" max="99" step="1" inputMode="numeric" placeholder="None" value={draft.urgency ?? ''} onChange={event=>update('urgency',event.target.value===''?null:Number(event.target.value))}/>
          <small>0–99 · higher numbers mean more urgent. Leave blank for none.</small>
        </label>
        <label className="field">
          <span>Date</span>
          <div className="field-row">
            <input
              type="date"
              value={draft.date}
              onChange={(event) => {
                const date = event.target.value
                onChange({
                  ...draft,
                  date,
                  endDate: draft.endDate < date ? date : draft.endDate,
                })
              }}
              required
            />
            {!draft.reminder && <><span className="field-sep">to</span>
            <input type="date" value={draft.endDate} onChange={(event) => update('endDate', event.target.value)} required /></>}
          </div>
        </label>

        <label className="check-row">
          <input type="checkbox" checked={draft.allDay} onChange={(event) => update('allDay', event.target.checked)} />
          {draft.reminder ? 'No specific time' : 'All day'}
        </label>

        {!draft.allDay && (
          <label className="field">
            <span>Time (New York)</span>
            <div className="field-row">
              <input type="time" value={draft.startTime} onChange={(event) => update('startTime', event.target.value)} />
              {!draft.reminder && <><span className="field-sep">to</span>
              <input type="time" value={draft.endTime} onChange={(event) => update('endTime', event.target.value)} /></>}
            </div>
          </label>
        )}

        <label className="field">
          <span>Repeats</span>
          <select
            value={draft.recurrence.frequency}
            onChange={(event) =>
              update('recurrence', {
                ...draft.recurrence,
                frequency: event.target.value as RecurrenceFrequency,
                interval: draft.recurrence.interval || 1,
              })
            }
          >
            {FREQUENCIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {repeating && (
          <div className="repeat-box">
            <label className="field">
              <span>How often</span>
              <div className="field-row">
                <span className="quiet">Every</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={draft.recurrence.interval}
                  onChange={(event) =>
                    update('recurrence', {
                      ...draft.recurrence,
                      interval: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
                <span className="quiet">{draft.recurrence.interval === 1 ? unit[0] : unit[1]}</span>
              </div>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={Boolean(draft.recurrence.until)}
                onChange={(event) =>
                  update('recurrence', {
                    ...draft.recurrence,
                    until: event.target.checked ? draft.endDate : null,
                  })
                }
              />
              End on a date
            </label>
            {draft.recurrence.until && (
              <input
                type="date"
                value={draft.recurrence.until}
                onChange={(event) => update('recurrence', { ...draft.recurrence, until: event.target.value })}
              />
            )}
            <p className="repeat-hint">{recurrenceLabel(draft.recurrence)}</p>
          </div>
        )}

        <label className="field">
          <span>Description</span>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Add a description"
            maxLength={2000}
          />
        </label>

        <label className="field"><span>Scheduling type</span><select aria-label="Scheduling type" value={draft.scheduleType||'fixed'} onChange={event=>update('scheduleType',event.target.value as 'fixed'|'planned')}><option value="fixed">Fixed event · sync to Google Calendar</option><option value="planned">Agent-planned event</option></select></label>
        <div className="field">
          <span>Tags</span>
          <div className="tag-picker">
            {tags.length === 0 && <p className="quiet">Create tags in the sidebar to group events.</p>}
            {tags.map((tag) => {
              const selected = draft.tagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag-chip ${selected ? 'is-selected' : ''}`}
                  style={
                    selected
                      ? { background: tag.color, borderColor: tag.color, color: contrastText(tag.color) }
                      : { borderColor: tag.color, color: tag.color }
                  }
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          {mode === 'edit' && onDelete && (
            <button type="button" className="danger-btn" onClick={onDelete}>
              <TrashIcon />
              Delete
            </button>
          )}
          <div className="modal-actions-right">
            <button type="button" className="text-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
