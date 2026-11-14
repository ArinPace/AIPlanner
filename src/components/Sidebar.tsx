import {FREE_TIME_TAG_ID} from '../lib/freeTime'
import {ScreenTimeIcon} from './Icons'
import {nativeRequest,supportsScreenTime} from '../lib/platform'
import {replicaContext} from '../lib/localReplica'
import {CalendarHistory} from './CalendarHistory'
import { TagChart } from './TagChart'
import { useState, type FormEvent } from 'react'
import type { CalendarEvent, CalendarView, Tag } from '../types'
import { nextTagColor, TAG_COLORS } from '../lib/colors'
import { PlusIcon, TrashIcon } from './Icons'
import type {ScheduleType} from '../lib/eventType'
import {FixedCalendarSync} from './FixedCalendarSync'

type SidebarProps = {
  open: boolean
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  cursor: Date
  onCreate: () => void
  events: CalendarEvent[]
  tags: Tag[]
  hiddenTagIds: Set<string>
  hiddenTypes:ScheduleType[]
  onToggleType:(type:ScheduleType)=>void
  onToggleTag: (id: string) => void
  onUpdateTag: (tag: Tag) => void
  onAddTag: (tag: Tag) => void
  onDeleteTag: (id: string) => void
}

export function Sidebar({
  open,
  view,
  onViewChange,
  cursor,
  onCreate,
  events,
  tags,
  hiddenTagIds,
  hiddenTypes,
  onToggleType,
  onToggleTag,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
}: SidebarProps) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chart, setChart] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draftTagId,setDraftTagId]=useState(()=>crypto.randomUUID())
  const [screenTimeError,setScreenTimeError]=useState('')
  function openTagScreenTime(id:string,title:string){setScreenTimeError('');void nativeRequest({action:'tagScreenTime',account:replicaContext().account,tag:{id,name:title}}).catch(error=>setScreenTimeError(error instanceof Error?error.message:'Could not open tag blocking.'))}
  const [editing,setEditing]=useState<string|null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(nextTagColor(tags))

  function submitTag(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    ;(editing?onUpdateTag:onAddTag)({
      id: editing || draftTagId,
      name: trimmed,
      color,
    })
    setEditing(null)
    setName('')
    setColor(nextTagColor([...tags, { id: 'temp', name: trimmed, color }]))
    setAdding(false)
  }

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <button type="button" className="create-btn sidebar-create" aria-label="Create event" title="Create event" onClick={onCreate}>
        <PlusIcon />
      </button>

      <div className="view-switch sidebar-view-switch" role="group" aria-label="Calendar view">
        {(['day', 'week', 'month', 'year'] as const).map(option => (
          <button key={option} type="button" aria-pressed={view === option} className={view === option ? 'is-active' : ''} onClick={() => onViewChange(option)}>
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
      <button type="button" className="text-btn sidebar-history" onClick={() => setHistoryOpen(true)}>Calendar history</button>
      {historyOpen && <CalendarHistory onClose={() => setHistoryOpen(false)} />}
      <section className="event-type-filter" aria-label="Event visibility">
        <h2>Show events</h2>
        <label><input type="checkbox" checked={!hiddenTypes.includes('fixed')} onChange={()=>onToggleType('fixed')}/>Fixed events</label>
        <label><input type="checkbox" checked={!hiddenTypes.includes('planned')} onChange={()=>onToggleType('planned')}/>Agent-planned events</label>
        <FixedCalendarSync/>
      </section>

      <section className="tag-section">
        <div className="tag-section-head">
          <h2>Tags</h2>
          <div className="tag-heading-actions"><button type="button" className="icon-btn" aria-label="Show tag statistics" title="Tag statistics" onClick={()=>setChart(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 3a9 9 0 1 0 10 10H11V3Z" stroke="currentColor" strokeWidth="1.7"/><path d="M14 2v8h8a9 9 0 0 0-8-8Z" stroke="currentColor" strokeWidth="1.7"/></svg></button>
          <button type="button" className="icon-btn" aria-label="Add tag" onClick={() => {setEditing(null);setDraftTagId(crypto.randomUUID());setName('');setColor(nextTagColor(tags));setAdding(value=>!value)}}>
            <PlusIcon size={16} />
          </button></div>
        </div>

        {adding && (
          <form className="tag-form" onSubmit={submitTag}>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Tag name"
              placeholder="Tag name"
              maxLength={24}
              autoFocus
            />
            <div className="color-row" role="group" aria-label="Tag color">
              {TAG_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`color-dot ${color === swatch ? 'is-selected' : ''}`}
                  style={{ background: swatch }}
                  aria-label={`Use color ${swatch}`}
                  aria-pressed={color===swatch}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
            <label className="tag-custom-color">Custom color<input type="color" aria-label="Custom tag color" value={color} onChange={event=>setColor(event.target.value)}/><span>{color}</span></label>
            <div className="tag-form-actions">{supportsScreenTime()&&<button type="button" className="icon-btn" aria-label="Screen Time for tag" title="Screen Time for this tag" disabled={!name.trim()} onClick={()=>openTagScreenTime(editing||draftTagId,name.trim())}><ScreenTimeIcon/></button>}
              <button type="button" className="text-btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="text-btn accent">
                {editing?'Save':'Add'}
              </button>
            </div>
          </form>
        )}

        {screenTimeError&&<p role="alert" className="form-error">{screenTimeError}</p>}
        <ul className="tag-list">
          <li><div className="tag-item"><input aria-label="Show Free time events" type="checkbox" checked={!hiddenTagIds.has(FREE_TIME_TAG_ID)} onChange={()=>onToggleTag(FREE_TIME_TAG_ID)}/><span className="tag-swatch" style={{background:'var(--bg)',border:'1px solid var(--muted)'}}/><span className="tag-name">Free time</span></div>{supportsScreenTime()&&<button type="button" className="icon-btn" aria-label="Screen Time for Free time tag" onClick={()=>openTagScreenTime(FREE_TIME_TAG_ID,'Free time')}><ScreenTimeIcon/></button>}</li>
          {tags.map((tag) => {
            const visible = !hiddenTagIds.has(tag.id)
            return (
              <li key={tag.id}>
                <div className="tag-item">
                  <input aria-label={`Show ${tag.name} events`} type="checkbox" checked={visible} onChange={() => onToggleTag(tag.id)} />
                  <button type="button" className="tag-edit" aria-label={`Edit ${tag.name} tag`} onClick={()=>{setEditing(tag.id);setName(tag.name);setColor(tag.color);setAdding(true)}}><span className="tag-swatch" style={{background:tag.color}}/><span className="tag-name">{tag.name}</span></button>
                </div>
                {supportsScreenTime()&&<button type="button" className="icon-btn" aria-label={'Screen Time for '+tag.name+' tag'} onClick={()=>openTagScreenTime(tag.id,tag.name)}><ScreenTimeIcon/></button>}
                <button
                  type="button"
                  className="icon-btn tag-delete"
                  aria-label={`Delete ${tag.name}`}
                  onClick={() => onDeleteTag(tag.id)}
                >
                  <TrashIcon size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      {chart && <TagChart events={events} tags={tags} cursor={cursor} onClose={()=>setChart(false)} />}
    </aside>
  )
}
