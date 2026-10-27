import { urgencyColor } from '../lib/urgencyColor'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { EventDraft, RecurrenceFrequency, Tag } from '../types'
import { contrastText } from '../lib/colors'
import { recurrenceLabel } from '../lib/recurrence'
import { CloseIcon, TrashIcon } from './Icons'
import {combineDateAndTime,toDateInput,toTimeInput} from '../lib/dates'
import {PlannerDate as Date} from '../lib/timezone'

type EventModalProps = {
  mode: 'create' | 'edit'
  draft: EventDraft
  tags: Tag[]
  onChange: (draft: EventDraft) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  nested?:boolean
  existingId?:string
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

export function EventModal({ mode, draft, tags, onChange, onClose, onSave, onDelete,nested=false,existingId }: EventModalProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [child,setChild]=useState<{id:string;draft:EventDraft}|null>(null)
  const folder=draft.eventKind==='folder'
  const childOpen=child!==null
  function updateChildren(items:{id:string;draft:EventDraft}[]){
    items=[...items].sort((a,b)=>(a.draft.date+'T'+a.draft.startTime).localeCompare(b.draft.date+'T'+b.draft.startTime))
    if(!items.length){onChange({...draft,folderChildren:items});return}
    const start=new Date(Math.min(...items.map(item=>combineDateAndTime(item.draft.date,item.draft.startTime).getTime())))
    const end=new Date(Math.max(...items.map(item=>item.draft.reminder?combineDateAndTime(item.draft.date,item.draft.startTime).getTime()+60000:combineDateAndTime(item.draft.endDate,item.draft.endTime).getTime())))
    onChange({...draft,folderChildren:items,date:toDateInput(start),startTime:toTimeInput(start),endDate:toDateInput(end),endTime:toTimeInput(end)})
  }
  function addChild(eventKind?:'folder'){
    const last=draft.folderChildren?.at(-1)?.draft,start=combineDateAndTime(last?.endDate||draft.date,last?.endTime||draft.startTime),end=new Date(start.getTime()+30*60000)
    setChild({id:crypto.randomUUID(),draft:{eventKind,title:'',description:'',date:toDateInput(start),endDate:toDateInput(end),startTime:toTimeInput(start),endTime:toTimeInput(end),allDay:false,tagIds:[...draft.tagIds],scheduleType:draft.scheduleType,recurrence:{frequency:'none',interval:1,until:null}}})
  }
  const accent = tags.find((tag) => draft.tagIds.includes(tag.id))?.color ?? '#1a73e8'

  useEffect(()=>{titleRef.current?.focus()},[])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape'&&!childOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose,childOpen])

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
    if (!(folder&&draft.folderChildren?.length)&&!draft.reminder && draft.endDate < draft.date) {
      setError('The end date must be on or after the start date.')
      return
    }
    if (!(folder&&draft.folderChildren?.length)&&!draft.reminder && !draft.allDay && draft.date === draft.endDate && draft.endTime <= draft.startTime) {
      setError('The end time must be after the start time.')
      return
    }
    setError('')
    try{onSave()}catch(error){setError(error instanceof Error?error.message:'Could not save this event.')}
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
    <><div className="modal-backdrop" inert={Boolean(child)} aria-hidden={child?true:undefined} onMouseDown={onClose}>
      <form className="event-modal" role="dialog" aria-modal="true" aria-label={folder?'Event folder':nested?'Event inside folder':'Calendar event'} onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
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

        <label className="field"><span>Type</span><select aria-label="Event type" value={folder?'folder':draft.reminder?'reminder':'event'} onChange={e=>onChange({...draft,eventKind:e.target.value==='folder'?'folder':undefined,reminder:e.target.value==='reminder',endDate:draft.date,...(e.target.value==='folder'?{...(existingId&&!folder?{folderChildren:[{id:existingId,draft:{...draft,eventKind:undefined,folderChildren:undefined}}]}:{}),allDay:false,recurrence:{frequency:'none',interval:1,until:null}}:{})})}><option value="event">Event</option><option value="reminder">Reminder</option><option value="folder" disabled={mode==='edit'&&(draft.allDay||draft.recurrence.frequency!=='none')}>Folder</option></select></label>
        {folder&&<section className="folder-event-builder" aria-label="Events inside folder"><div className="folder-builder-heading"><strong>Events in this folder</strong><div className="folder-builder-actions"><button type="button" className="text-btn" onClick={()=>addChild()}>+ Add event</button><button type="button" className="text-btn" onClick={()=>addChild('folder')}>+ Add folder</button></div></div><p className="quiet">The folder's time range fits its events. Events keep their own details. Folders group timed, non-recurring events.</p>{!(draft.folderChildren?.length)&&<p className="quiet">Add the first event to get started.</p>}{draft.folderChildren?.map(item=><div className="folder-builder-item" key={item.id}><button type="button" className="text-btn" onClick={()=>setChild(item)}>{item.draft.title}<small>{item.draft.date} · {item.draft.startTime}–{item.draft.endTime}</small></button><button type="button" className="text-btn" aria-label={'Remove '+item.draft.title+' from folder'} onClick={()=>updateChildren((draft.folderChildren||[]).filter(value=>value.id!==item.id))}>Remove from folder</button></div>)}</section>}
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
          <input type="checkbox" disabled={folder||nested} checked={draft.allDay} onChange={(event) => update('allDay', event.target.checked)} />
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
            disabled={folder||nested}
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

        <label className="field"><span>Scheduling type</span><select aria-label="Scheduling type" value={draft.scheduleType||'fixed'} onChange={event=>update('scheduleType',event.target.value as 'fixed'|'planned')}><option value="fixed">{folder?'Fixed grouping':'Fixed event \u00b7 sync to Google Calendar'}</option><option value="planned">Agent-planned event</option></select></label>
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
    </div>{child&&<EventModal key={child.id} nested existingId={draft.folderChildren?.some(item=>item.id===child.id)?child.id:undefined} mode={draft.folderChildren?.some(item=>item.id===child.id)?'edit':'create'} draft={child.draft} tags={tags} onChange={value=>setChild({...child,draft:value})} onClose={()=>setChild(null)} onSave={()=>{const old=draft.folderChildren?.find(item=>item.id===child.id);const converted=old&&old.draft.eventKind!=='folder'&&child.draft.eventKind==='folder';updateChildren([...(draft.folderChildren||[]).filter(item=>item.id!==child.id),{...child,id:converted?crypto.randomUUID():child.id}]);setChild(null)}}/>}</>
  )
}
