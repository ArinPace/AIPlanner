export const VM_SOURCES = {
  brightspace: { name: 'Brightspace', url: 'https://brightspace.nyu.edu/' },
  gradescope: { name: 'Gradescope', url: 'https://www.gradescope.com/' },
  gmail: { name: 'Gmail', url: 'https://mail.google.com/mail/u/0/' },
  calendar: { name: 'Google Calendar', url: 'https://calendar.google.com/calendar/u/0/r' },
  drive: { name: 'Google Drive', url: 'https://drive.google.com/drive/u/0/my-drive' },
  slack: { name: 'Slack', url: 'https://app.slack.com/' },
  instagram: { name: 'Instagram', url: 'https://www.instagram.com/' },
  albert: { name: 'NYU Albert', url: 'https://albert.nyu.edu/' },
  whatsapp: { name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  x: { name: 'X', url: 'https://x.com/home' },
} as const
export type VmSource = keyof typeof VM_SOURCES
export interface BrowserAccount { id: string; source: VmSource; identity: string | null; label: string | null; active: boolean; verified_at: string }
export interface VmHost { id: string; label: string; online: boolean; heartbeat_at: string | null; capabilities: { signedIn?: boolean; identity?: string; version?: string; runtime?: string; chatgptConnected?: boolean; claudeConnected?: boolean } }
export interface VmChat { id: string; title: string; archived?: boolean; updated_at: string; deleted_at?:string|null }
export interface VmJob { id: string; chat_id: string | null; kind: string; status: string; message: string; reply: string; error: string | null; created_at: string; started_at: string | null; finished_at: string | null; result: { connected?: boolean; connectedAt?: string; source?: VmSource; signInRequired?: boolean; interrupted?: boolean; liveUrl?: string; expiresAt?: string; deviceCode?: { verificationUrl: string; userCode: string }; sites?: Record<string, { ready: boolean }> } }
export interface VmState { queue?: {active:{id:string;chat_id:string|null;kind:string;started_at:string|null}|null;queuedIds:string[]}; accounts?: BrowserAccount[]; google?: { configured: boolean; connected: boolean; identity: string | null; updatedAt: string | null; activeAccountId: string | null; accounts: {id: string; identity: string; updatedAt: string; connected: boolean}[] }; power: 'online' | 'offline' | 'starting' | 'preparing'; hosts: VmHost[]; chats: VmChat[]; deletedChats?: VmChat[]; settings: { whatsapp_read_consent_at?: string | null; sources: VmSource[]; schedule_enabled: boolean; sites: Record<string, { ready: boolean; verifiedAt?: string }>; ai_provider: string | null; schedule: { timezone: string; times: string[]; instructions?: string } }; runs: VmJob[]; provisioning: { status: string; error: string | null } | null; personalChatGptAvailable: boolean; hostedChatGptAvailable: boolean; recordings: false }
