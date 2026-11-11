import { contrastText } from './colors'
import {freeTimeAppearance} from './freeTime'

export function eventAppearance(color: string, reminder?: boolean) {
 if (!reminder && color.toLowerCase() === '#ffffff') return freeTimeAppearance
 const fill = `color-mix(in srgb, ${color} var(--calendar-color-strength, 100%), var(--calendar-color-base, transparent))`
 return {
  background: reminder ? 'transparent' : fill,
  color: reminder ? color : `var(--calendar-event-text, ${contrastText(color)})`,
  ...(reminder ? {border: '1px solid ' + color} : {}),
 }
}
