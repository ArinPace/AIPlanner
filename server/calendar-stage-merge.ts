import {ApiError} from './cloud.js'
import type {StoredState} from '../src/types.js'

/** Carry unrelated newer edits forward when a parallel draft is published. */
export function rebaseCalendarDraft(base: StoredState, draft: StoredState, current: StoredState): StoredState {
 const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
 function conflict(label: string): never {
  throw new ApiError(409, 'This draft is saved, but newer changes also edited ' + label + '. Review that conflict before publishing.')
 }
 function fields<T extends object>(before: T, proposed: T, latest: T, label: string): T {
  const result = {...latest} as Record<string, unknown>
  const a = before as Record<string, unknown>, b = proposed as Record<string, unknown>, c = latest as Record<string, unknown>
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
   if (same(a[key], b[key])) continue
   if (!same(a[key], c[key]) && !same(b[key], c[key])) conflict(label + ' (' + key + ')')
   if (key in b) result[key] = structuredClone(b[key])
   else delete result[key]
  }
  return result as T
 }
 function items<T extends {id: string}>(before: T[], proposed: T[], latest: T[], label: string): T[] {
  const original = new Map(before.map(item => [item.id, item]))
  const changes = new Map(proposed.map(item => [item.id, item]))
  const result: T[] = []
  for (const item of latest) {
   const old = original.get(item.id), next = changes.get(item.id)
   if (!old) {
    if (next && !same(next, item)) conflict(label + ' ' + item.id)
    result.push(item)
   } else if (!next) {
    if (!same(old, item)) conflict(label + ' ' + item.id)
   } else result.push(fields(old, next, item, label + ' ' + item.id))
  }
  for (const item of proposed) {
   if (latest.some(existing => existing.id === item.id)) continue
   if (original.has(item.id)) {
    if (!same(original.get(item.id), item)) conflict(label + ' ' + item.id)
   } else result.push(item)
  }
  return result
 }
 const {events: _events, tags: _tags, ...before} = base
 const {events: _draftEvents, tags: _draftTags, ...proposed} = draft
 const {events: _currentEvents, tags: _currentTags, ...latest} = current
 return {
  ...fields(before, proposed, latest, 'calendar settings'),
  events: items(base.events, draft.events, current.events, 'event'),
  tags: items(base.tags, draft.tags, current.tags, 'tag'),
 } as StoredState
}
