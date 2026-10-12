import type { Tag } from '../types'

export const DEFAULT_TAGS: Tag[] = [
  { id: 'work', name: 'Work', color: '#1a73e8' },
  { id: 'personal', name: 'Personal', color: '#0b8043' },
  { id: 'family', name: 'Family', color: '#d50000' },
  { id: 'health', name: 'Health', color: '#8e24aa' },
]

export function createId(): string {
  return crypto.randomUUID()
}
