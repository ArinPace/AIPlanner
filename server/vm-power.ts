export type VmSchedule = { timezone: string; times: string[]; instructions?: string }
export const DEFAULT_REVIEW_INSTRUCTIONS = 'Check every enabled source for new announcements, assignments and deadline changes. Read the planner first, save verified updates with planner_apply_updates, and report sources that were checked or unavailable. Maintain one canonical folder per subject and refresh its Subject overview with verified syllabus information, assignments, deadlines, readings, resources and updates. Reuse existing course names across sources. Do not invent deadlines or overwrite manual edits.'
export const DEFAULT_VM_SCHEDULE: VmSchedule = { timezone: 'America/New_York', times: ['07:00', '17:00'] }
export function validateSchedule(value: unknown): VmSchedule {
  const input = value as Partial<VmSchedule> | null
  if (!input || typeof input.timezone !== 'string' || input.timezone.length > 80 || !Array.isArray(input.times) || input.times.length < 1 || input.times.length > 6 || input.times.some(t => typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('Choose a timezone and one to six valid daily times.')
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format() } catch { throw new Error('Choose a valid timezone.') }
  if(input.instructions!==undefined && (typeof input.instructions!=='string' || input.instructions.length>12000))throw new Error('Review instructions must be text of at most 12,000 characters.')
  return { timezone: DEFAULT_VM_SCHEDULE.timezone, times: [...new Set(input.times)].sort(), ...(input.instructions===undefined?{}:{instructions:input.instructions.trim()}) }
}
export function scheduledReviewMessage(schedule:VmSchedule){
  return 'Planner timezone: America/New_York (EST/EDT). Interpret unspecified planner times as New York time and report times in that timezone.\n'+DEFAULT_REVIEW_INSTRUCTIONS+'\n\nSaved review instructions:\n'+(schedule.instructions || DEFAULT_REVIEW_INSTRUCTIONS)+'\n\nCore planning workflow: read planner_planning_read and Main Chat context. Keep the calendar up to date from authorized connected sources. If planning is enabled and onboarded, register verified deadline work and user to-dos with planner_task_save (reuse IDs, request missing duration estimates in Main Chat, never invent requirements), then planner_replan the next seven days. Preserve fixed commitments, respect intensity/recovery settings, and report infeasible tasks. If onboarding is incomplete, ask focused questions in Main Chat; do not silently assume routines or publish a full-day plan. Never infer completion from elapsed time. Use actual feedback to learn estimates.'
}
export function scheduleSlot(now = new Date(), schedule = DEFAULT_VM_SCHEDULE, prewake = true): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_VM_SCHEDULE.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now.getTime() + (prewake ? 2 * 60000 : 0)))
  const p = (type: string) => parts.find(x => x.type === type)?.value || ''
  const current = Number(p('hour')) * 60 + Number(p('minute'))
  const time = [...schedule.times].sort().reverse().find(t => { const [h,m] = t.split(':').map(Number); return current >= h * 60 + m && current < h * 60 + m + 60 })
  if (!time) return null
  return `${p('year')}-${p('month')}-${p('day')} ${time.endsWith(':00') ? time.slice(0,2) : time}`
}
export function shouldRunVm(input: { wakeUntil?: string | null; jobs: { chat_id?:string|null; status: string; kind: string; result?: { expiresAt?: string }; schedule_slot?: string | null; finished_at?: string | null }[]; scheduled: boolean; schedule?: VmSchedule }, now = new Date()): boolean {
  if (input.wakeUntil && Date.parse(input.wakeUntil) > now.getTime()) return true
  if (input.jobs.some(j => ['queued', 'running'].includes(j.status) || (j.status==='waiting' && !input.jobs.some(p=>p.status==='paused' && p.chat_id===j.chat_id)))) return true
  // Keep the computer warm between conversational turns instead of rebooting
  // after every reply. Background-only checks still shut down when finished.
  if (input.jobs.some(j => j.kind === 'chat' && ['completed', 'failed', 'cancelled'].includes(j.status) && Date.parse(j.finished_at || '') > now.getTime() - 30 * 60000)) return true
  if (input.jobs.some(j => j.kind === 'browser_login' && j.status === 'completed' && Date.parse(j.result?.expiresAt || '') > now.getTime())) return true
  const slot = scheduleSlot(now, input.schedule)
  return Boolean(input.scheduled && slot && !input.jobs.some(j => j.schedule_slot === slot))
}
