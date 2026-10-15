export const VM_SOURCES = {
  brightspace: { name: 'Brightspace', url: 'https://brightspace.nyu.edu/' },
  gradescope: { name: 'Gradescope', url: 'https://www.gradescope.com/' },
  gmail: { name: 'Gmail', url: 'https://mail.google.com/mail/u/0/' },
  calendar: { name: 'Google Calendar', url: 'https://calendar.google.com/calendar/u/0/r' },
  drive: { name: 'Google Drive', url: 'https://drive.google.com/drive/u/0/my-drive' },
  slack: { name: 'Slack', url: 'https://app.slack.com/' },
  instagram: { name: 'Instagram', url: 'https://www.instagram.com/' },
  x: { name: 'X', url: 'https://x.com/home' },
} as const
export type VmSource = keyof typeof VM_SOURCES
export interface VmHost { id: string; label: string; online: boolean; heartbeat_at: string | null; capabilities: { signedIn?: boolean; identity?: string; version?: string; runtime?: string } }
export interface VmChat { id: string; title: string; updated_at: string }
export interface VmJob { id: string; chat_id: string | null; kind: string; status: string; message: string; reply: string; error: string | null; created_at: string; started_at: string | null; finished_at: string | null; result: { liveUrl?: string; expiresAt?: string; deviceCode?: { verificationUrl: string; userCode: string }; sites?: Record<string, { ready: boolean }> } }
export interface VmState { hosts: VmHost[]; chats: VmChat[]; settings: { sources: VmSource[]; schedule_enabled: boolean; sites: Record<string, { ready: boolean }>; ai_provider: string | null }; runs: VmJob[]; provisioning: { status: string; error: string | null } | null; personalChatGptAvailable: boolean; hostedChatGptAvailable: boolean; recordings: false }
