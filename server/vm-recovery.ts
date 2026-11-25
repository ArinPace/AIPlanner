// Recover each stale heartbeat at most once. A running lease must be allowed
// to expire before a graceful reboot; never replay an uncertain write.
export function workerRecovery(input: { heartbeat: string | null; recoveredHeartbeat: string | null; recoveringSince: string | null; power: string | null; hasLease: boolean; wantsRun: boolean }, now = Date.now()): 'stop' | 'start' | 'none' {
  if (input.recoveringSince) return input.power === 'Off' || input.power === 'Saved' || Date.parse(input.heartbeat || '') > Date.parse(input.recoveringSince) ? 'start' : 'stop'
  const heartbeat = Date.parse(input.heartbeat || '')
  if (!input.wantsRun || input.hasLease || input.power !== 'Running' || !Number.isFinite(heartbeat) || now - heartbeat < 5 * 60000 || input.recoveredHeartbeat === input.heartbeat) return 'none'
  return 'stop'
}
