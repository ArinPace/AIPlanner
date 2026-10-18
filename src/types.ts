export type CalendarView = 'day' | 'week' | 'month' | 'year'

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Recurrence {
  frequency: RecurrenceFrequency
  interval: number
  until: string | null
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface CalendarEvent {
  planning?: {kind:'task'|'break'|'routine'|'sleep';taskId?:string;locked:boolean}
  id: string
  reminder?: boolean
  urgency?: number | null
  title: string
  description: string
  start: string
  end: string
  allDay: boolean
  tagIds: string[]
  recurrence: Recurrence
  agentSnapshot?: string
}

export interface Occurrence {
  event: CalendarEvent
  start: Date
  end: Date
}

export interface StoredState {
  revision?: number
  events: CalendarEvent[]
  tags: Tag[]
  hiddenTagIds: string[]
  zoom?: number
}

export interface EventDraft {
  reminder?: boolean
  urgency?: number | null
  title: string
  description: string
  date: string
  endDate: string
  startTime: string
  endTime: string
  allDay: boolean
  tagIds: string[]
  recurrence: Recurrence
}
