export function scheduleSlot(now = new Date()): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const p = (type: string) => parts.find(x => x.type === type)?.value || ''
  let hour = p('hour')
  if (['06', '16'].includes(hour) && Number(p('minute')) >= 58) hour = String(Number(hour) + 1).padStart(2, '0')
  if (!['07', '17'].includes(hour)) return null
  return `${p('year')}-${p('month')}-${p('day')} ${hour}`
}
export function shouldRunVm(input: { wakeUntil?: string | null; jobs: { status: string; kind: string; result?: { expiresAt?: string }; schedule_slot?: string | null; finished_at?: string | null }[]; scheduled: boolean }, now = new Date()): boolean {
  if (input.wakeUntil && Date.parse(input.wakeUntil) > now.getTime()) return true
  if (input.jobs.some(j => ['queued', 'running'].includes(j.status))) return true
  // Keep the computer warm between conversational turns instead of rebooting
  // after every reply. Background-only checks still shut down when finished.
  if (input.jobs.some(j => j.kind === 'chat' && ['completed', 'failed', 'cancelled'].includes(j.status) && Date.parse(j.finished_at || '') > now.getTime() - 5 * 60000)) return true
  if (input.jobs.some(j => j.kind === 'browser_login' && j.status === 'completed' && Date.parse(j.result?.expiresAt || '') > now.getTime())) return true
  const slot = scheduleSlot(now)
  return Boolean(input.scheduled && slot && !input.jobs.some(j => j.schedule_slot === slot))
}
