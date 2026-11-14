import { contrastText } from './colors'
import {freeTimeAppearance} from './freeTime'

export function eventAppearance(color: string, reminder?: boolean) {
 if (!reminder && color.toLowerCase() === '#ffffff') return freeTimeAppearance
 const fill = `color-mix(in srgb, ${color} var(--calendar-event-opacity, var(--calendar-color-strength, 100%)), var(--calendar-color-base, transparent))`
 return {
  '--event-accent':color,
  background: reminder ? 'transparent' : fill,
  color: reminder ? color : `var(--calendar-translucent-ink, var(--calendar-event-text, ${contrastText(color)}))`,
  ...(reminder ? {border: '1px solid ' + color} : {}),
 }
}
