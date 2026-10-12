import type { CalendarView } from '../types'

export const MIN_ZOOM = 0.6
export const MAX_ZOOM = 2
export const ZOOM_STEP = 0.1
export const DEFAULT_ZOOM = 1

export const DATE_VIEWS: CalendarView[] = ['day', 'week', 'month', 'year']
export const PINCH_WHEEL_THRESHOLD = 90
export const PINCH_SCALE_STEP = 1.2

export function clampZoom(value: number): number {
  const stepped = Math.round(value / ZOOM_STEP) * ZOOM_STEP
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(stepped.toFixed(1))))
}

export function zoomDateView(view: CalendarView, direction: -1 | 1): CalendarView {
  const index = DATE_VIEWS.indexOf(view)
  const next = index + direction
  if (next < 0 || next >= DATE_VIEWS.length) return view
  return DATE_VIEWS[next] ?? view
}

