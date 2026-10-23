import { TagChart } from './TagChart'
import { useState, type FormEvent } from 'react'
import type { CalendarEvent, Tag } from '../types'
import { nextTagColor, TAG_COLORS } from '../lib/colors'
import { PlusIcon, TrashIcon } from './Icons'
import { MiniCalendar } from './MiniCalendar'
import type {ScheduleType} from '../lib/eventType'
import {FixedCalendarSync} from './FixedCalendarSync'

type SidebarProps = {
  open: boolean
  cursor: Date
  onCursorChange: (date: Date) => void
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
  cursor,
  onCursorChange,
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
  const [chart, setChart] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing,setEditing]=useState<string|null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(nextTagColor(tags))

  function submitTag(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    ;(editing?onUpdateTag:onAddTag)({
      id: editing || crypto.randomUUID(),
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
      <button type="button" className="create-btn sidebar-create" onClick={onCreate}>
        <PlusIcon />
        Create
      </button>

      <MiniCalendar cursor={cursor} onCursorChange={onCursorChange} />
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
          <button type="button" className="icon-btn" aria-label="Add tag" onClick={() => {setEditing(null);setName('');setColor(nextTagColor(tags));setAdding(value=>!value)}}>
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
            <div className="tag-form-actions">
              <button type="button" className="text-btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="text-btn accent">
                {editing?'Save':'Add'}
              </button>
            </div>
          </form>
        )}

        <ul className="tag-list">
          {tags.map((tag) => {
            const visible = !hiddenTagIds.has(tag.id)
            return (
              <li key={tag.id}>
                <div className="tag-item">
                  <input aria-label={`Show ${tag.name} events`} type="checkbox" checked={visible} onChange={() => onToggleTag(tag.id)} />
                  <button type="button" className="tag-edit" aria-label={`Edit ${tag.name} tag`} onClick={()=>{setEditing(tag.id);setName(tag.name);setColor(tag.color);setAdding(true)}}><span className="tag-swatch" style={{background:tag.color}}/><span className="tag-name">{tag.name}</span></button>
                </div>
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
