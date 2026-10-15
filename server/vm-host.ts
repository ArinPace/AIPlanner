import { randomBytes } from 'node:crypto'
import { ApiError, body, db, json } from './cloud.js'
import { uuid, vmHash } from './vm-validation.js'
import { shouldRunVm } from './vm-power.js'

function checked<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw new ApiError(503, 'Could not access private computer setup.')
  return data as NonNullable<T>
}
export async function queuePersonalVm(username: string) {
  checked(await db().from('planner_vm_provisioning').upsert({ username }, { onConflict: 'username', ignoreDuplicates: true }))
}
export async function registerVmHost(username: string) {
  if (!(process.env.VM_HOST_OPERATORS || 'arin').split(',').map(x => x.trim()).includes(username)) throw new ApiError(403, 'Only the Windows host operator can register a VM server.')
  const token = 'ppool_' + randomBytes(32).toString('base64url')
  checked(await db().from('planner_vm_pools').update({ revoked_at: new Date().toISOString() }).eq('operator', username).is('revoked_at', null))
  const pool = checked(await db().from('planner_vm_pools').insert({ operator: username, token_hash: vmHash(token) }).select('id,max_vms').single())
  return json({ ...pool, token }, 201)
}
export async function handleVmPool(request: Request, path: string) {
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.')
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
  if (!/^ppool_[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, 'Host authorization required.')
  const pool = checked(await db().from('planner_vm_pools').select('id,max_vms').eq('token_hash', vmHash(token)).is('revoked_at', null).maybeSingle())
  if (!pool) throw new ApiError(401, 'Host registration was revoked.')
  const input = await body(request)
  checked(await db().from('planner_vm_pools').update({ heartbeat_at: new Date().toISOString() }).eq('id', pool.id))
  if (path.endsWith('/power')) {
    const computers = checked(await db().from('planner_vm_provisioning').select('username,status,wake_until,lease_until').eq('pool_id', pool.id))
    const decisions = []
    for (const computer of computers) {
      if (computer.status !== 'ready') {
        decisions.push({ username: computer.username, shouldRun: computer.status === 'provisioning' && Date.parse(computer.lease_until || '') > Date.now() })
        continue
      }
      const [settings, jobs, host] = await Promise.all([
        db().from('planner_vm_settings').select('schedule_enabled,schedule').eq('username', computer.username).maybeSingle(),
        db().from('planner_vm_jobs').select('kind,status,result,schedule_slot,created_at,finished_at').eq('username', computer.username).or(`created_at.gte.${new Date(Date.now() - 86400000).toISOString()},status.in.(queued,running)`),
        db().from('planner_vm_hosts').select('id').eq('username', computer.username).is('revoked_at', null).maybeSingle(),
      ])
      decisions.push({ username: computer.username, shouldRun: Boolean(checked(host)) && shouldRunVm({ wakeUntil: computer.wake_until, scheduled: checked(settings)?.schedule_enabled || false, schedule: settings.data?.schedule, jobs: checked(jobs) }) })
    }
    return json({ computers: decisions, capacity: pool.max_vms })
  }
  if (path.endsWith('/claim')) {
    const count = Number(input.vmCount)
    if (!Number.isSafeInteger(count) || count < 0) throw new ApiError(400, 'Report VM capacity.')
    const code = randomBytes(24).toString('base64url')
    const job = checked(await db().rpc('planner_vm_provision_claim', { p_pool: pool.id, p_code_hash: vmHash(code), p_vm_count: count }))
    return json({ job: job ? { username: job.username, lease: job.lease, code } : null, capacity: pool.max_vms })
  }
  if (path.endsWith('/finish')) {
    if (!uuid(input.lease) || typeof input.username !== 'string') throw new ApiError(400, 'Invalid provisioning lease.')
    const rows = checked(await db().from('planner_vm_provisioning').update({ status: input.error ? 'failed' : 'ready', error: input.error ? 'Your private computer could not be prepared. The server operator needs to retry setup.' : null, updated_at: new Date().toISOString() }).eq('pool_id', pool.id).eq('username', input.username).eq('lease', input.lease).eq('status', 'provisioning').gt('lease_until', new Date().toISOString()).select('username'))
    if (!rows.length) throw new ApiError(409, 'Provisioning lease expired.')
    return json({ ok: true })
  }
  throw new ApiError(404, 'Unknown VM host action.')
}
