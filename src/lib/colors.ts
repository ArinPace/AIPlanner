import type { CalendarEvent, Tag } from '../types.js'

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
  '#b71c1c', '#ef5350', '#f48fb1', '#e91e63', '#ad1457',
  '#6a1b9a', '#ab47bc', '#ce93d8', '#4527a0', '#7e57c2',
  '#b39ddb', '#283593', '#5c6bc0', '#1565c0', '#42a5f5',
  '#90caf9', '#0277bd', '#29b6f6', '#80deea', '#00838f',
  '#00acc1', '#00695c', '#26a69a', '#80cbc4', '#2e7d32',
  '#66bb6a', '#a5d6a7', '#558b2f', '#9ccc65', '#c0ca33',
  '#f9a825', '#ffca28', '#ffe082', '#ef6c00', '#ff9800',
  '#ffb74d', '#d84315', '#8d6e63', '#455a64', '#212121',
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
