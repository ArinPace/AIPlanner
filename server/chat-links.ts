import { ApiError, body, db, json } from './cloud.js'

export function chatUrl(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'Paste a ChatGPT conversation link.')
  let url: URL
  try { url = new URL(value) } catch { throw new ApiError(400, 'Paste a ChatGPT conversation link.') }
  if (url.origin !== 'https://chatgpt.com' || url.username || url.password || !/^\/(?:g\/[^/]+\/)?c\/[a-zA-Z0-9-]{16,100}$/.test(url.pathname)) throw new ApiError(400, 'Use a private conversation link from chatgpt.com/c/…')
  return `${url.origin}${url.pathname}`
}

export async function saveChatLink(username: string, input: Record<string, unknown>) {
  const url = chatUrl(input.url)
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title || title.length > 120) throw new ApiError(400, 'Give the chat a name of 1–120 characters.')
  const { data, error } = await db().from('planner_chat_links').upsert({ username, title, url, updated_at: new Date().toISOString() }, { onConflict: 'username,url' }).select('id,title,url,created_at,updated_at').single()
  if (error) throw new ApiError(503, 'Could not save the chat link.')
  return data
}

export async function handleChatLinks(request: Request, path: string, username: string) {
  if (request.method === 'GET' && path === '/api/agent/chats') {
    const [chats, grants, browser] = await Promise.all([
      db().from('planner_chat_links').select('id,title,url,created_at,updated_at').eq('username', username).order('updated_at', { ascending: false }),
      db().from('planner_mcp_tokens').select('id,client_id,scope,created_at').eq('username', username).is('revoked_at', null).gt('refresh_expires_at', new Date().toISOString()),
      db().from('planner_agent_settings').select('profile_id,schedule_enabled').eq('username', username).maybeSingle(),
    ])
    if (chats.error || grants.error || browser.error) throw new ApiError(503, 'Could not load chats.')
    return json({ chats: chats.data, connected: Boolean(grants.data?.length), browserSaved: Boolean(browser.data?.profile_id), browserScheduleEnabled: Boolean(browser.data?.schedule_enabled), mcpUrl: `${process.env.APP_ORIGIN || 'https://aiplanner-ten.vercel.app'}/api/mcp` })
  }
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST for this action.')
  const input = await body(request)
  if (path === '/api/agent/mcp/disconnect') {
    const { error } = await db().from('planner_mcp_tokens').update({revoked_at:new Date().toISOString()}).eq('username',username).is('revoked_at',null)
    if (error) throw new ApiError(503,'Could not disconnect the planner.')
    return json({ok:true})
  }
  if (path === '/api/agent/chats/remove') {
    const { error } = await db().from('planner_chat_links').delete().eq('username', username).eq('id', String(input.id))
    if (error) throw new ApiError(503, 'Could not remove the link.')
    return json({ ok: true })
  }
  return json(await saveChatLink(username, input))
}
