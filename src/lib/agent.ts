import {agentNetworkRequest} from './agentNetwork.js'
import { getToken } from './api'

export type AgentSource = 'brightspace' | 'gradescope' | 'gmail' | 'calendar' | 'drive' | 'slack' | 'instagram' | 'x' | 'albert' | 'whatsapp'
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
export function agentRequest<T>(path:string,options:RequestInit={}):Promise<T>{return agentNetworkRequest<T>(path,options,getToken())}
export function agentAction<T>(path: string, value: unknown = {}) { return agentRequest<T>(path, { method: 'POST', body: JSON.stringify(value) }) }
