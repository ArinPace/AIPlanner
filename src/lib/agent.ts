import { getToken } from './api'

export type AgentSource = 'brightspace' | 'gradescope' | 'gmail' | 'calendar' | 'drive' | 'slack' | 'instagram' | 'x'
export interface AgentRun {
  id: string; kind: string; status: string; trigger: string; task: string
  created_at: string; finished_at: string | null; summary: string | null; error: string | null
  live_url: string | null; applied_at: string | null
}
export interface AgentMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string }
export interface AgentState {
  allowed: boolean; browserConfigured: boolean; chatConfigured: boolean
  oauth: { google: boolean; openai: boolean }
  connections: { provider: string; identity: string; updated_at: string }[]
  settings: { schedule_enabled: boolean; sources: AgentSource[]; context_focus: string; profile_id: string | null; login_url: string | null; login_browser_id: string | null }
  runs: AgentRun[]; messages: AgentMessage[]
}
export async function agentRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/agent/${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}`, ...options.headers } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Could not reach the agent. Please try again.')
  return data as T
}
export function agentAction<T>(path: string, value: unknown = {}) { return agentRequest<T>(path, { method: 'POST', body: JSON.stringify(value) }) }
