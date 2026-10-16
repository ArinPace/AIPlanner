import { ApiError, db } from './cloud.js'
import { VM_SOURCES } from '../src/lib/vm.js'

export function accountIdentity(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= 200 && ![...value].some(c=>c.charCodeAt(0)<32 || c==='<' || c==='>') ? value.trim() : null
}
export async function observeAccounts(username: string, sites: Record<string, { ready?: boolean; identity?: unknown }>, enabled: string[]) {
  for (const source of Object.keys(VM_SOURCES)) {
    if (!enabled.includes(source) || sites[source]?.ready !== true) continue
    const { error } = await db().rpc('planner_browser_account_update', { p_username: username, p_source: source, p_action: 'observe', p_identity: accountIdentity(sites[source].identity) })
    if (error) throw new ApiError(503, 'Could not save connected account information.')
  }
}
export async function editBrowserAccount(username: string, input: Record<string, unknown>) {
  const source = String(input.source || '')
  if (!(source in VM_SOURCES) || !['rename','remove'].includes(String(input.action))) throw new ApiError(400,'Choose an account action.')
  const label = accountIdentity(input.label)
  if (input.action === 'rename' && !label) throw new ApiError(400,'Enter an account label of at most 200 characters.')
  const { error } = await db().rpc('planner_browser_account_update', { p_username: username, p_source: source, p_action: input.action, p_id: input.id, p_label: label })
  if (error) throw new ApiError(error.code === 'P0002' ? 404 : 503, error.code === 'P0002' ? 'Account not found.' : 'Could not update the account.')
}
