import type { CalendarEvent, Tag } from '../types'

export const TAG_COLORS = [
  '#1a73e8',
  '#0b8043',
  '#d50000',
  '#8e24aa',
  '#f4511e',
  '#039be5',
  '#33b679',
  '#f6bf26',
  '#7986cb',
  '#616161',
] as const

export const DEFAULT_EVENT_COLOR = '#1a73e8'

export function nextTagColor(existing: Tag[]): string {
  const used = new Set(existing.map((tag) => tag.color))
  return TAG_COLORS.find((color) => !used.has(color)) ?? TAG_COLORS[existing.length % TAG_COLORS.length]
}

export function eventColor(event: CalendarEvent, tags: Tag[]): string {
  for (const tagId of event.tagIds) {
    const tag = tags.find((item) => item.id === tagId)
    if (tag) return tag.color
  }
  return DEFAULT_EVENT_COLOR
}

export function isEventVisible(event: CalendarEvent, hiddenTagIds: Set<string>): boolean {
  if (event.tagIds.length === 0) return true
  return event.tagIds.some((tagId) => !hiddenTagIds.has(tagId))
}

export function contrastText(hex: string): string {
  const value = hex.replace('#', '')
  const red = parseInt(value.slice(0, 2), 16)
  const green = parseInt(value.slice(2, 4), 16)
  const blue = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.65 ? '#202124' : '#ffffff'
}
