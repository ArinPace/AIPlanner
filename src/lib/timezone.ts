import { TZDate } from '@date-fns/tz'

export const APP_TIME_ZONE = 'America/New_York'

/** A scoped Date replacement: calendar getters, setters and formatters use New York.
 * Epoch values still represent the original instant; no stored events are shifted.
 */
class NewYorkDate extends TZDate {
 constructor()
 constructor(value: string | number | Date)
 constructor(year:number, month:number, date?:number, hours?:number, minutes?:number, seconds?:number, ms?:number)
 constructor(...args:unknown[]) {
  super(0, APP_TIME_ZONE)
  // Date-only values and offset-free form values represent New York wall time.
  if(typeof args[0]==='string'){
   const match=args[0].match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/)
   if(match)args=[Number(match[1]),Number(match[2])-1,Number(match[3]),Number(match[4]||0),Number(match[5]||0),Number(match[6]||0),Number((match[7]||'0').padEnd(3,'0'))]
  }
  return Reflect.construct(TZDate,[...(args.length?args:[Date.now()]),APP_TIME_ZONE])
 }
}

// Expose the standard Date interface so callers may pass ordinary Date instances.
export const PlannerDate = NewYorkDate as unknown as DateConstructor
