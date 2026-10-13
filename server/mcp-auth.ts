import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { ApiError, body, db, json } from './cloud.js'
import { normalizeUsername, tokenHash, verifyPassword } from './auth.js'

export const MCP_ORIGIN = process.env.APP_ORIGIN || 'https://aiplanner-ten.vercel.app'
export const MCP_RESOURCE = `${MCP_ORIGIN}/api/mcp`
export const MCP_SCOPES = ['planner:read', 'planner:write', 'browser:read']
export function storage<T>({ data, error }: { data: T; error: { code?: string } | null }): NonNullable<T> {
  if (error) { console.error('MCP storage failed', { code: error.code }); throw new ApiError(503, 'Could not access planner connection storage.') }
  return data as NonNullable<T>
}
export function validRedirect(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    return !url.username && !url.password && !url.hash && ((url.protocol === 'https:' && ['chatgpt.com','platform.openai.com'].includes(url.hostname)) || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))
  } catch { return false }
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)
const secret = () => randomBytes(32).toString('base64url')
function formPage(id: string, name: string, scope: string, error = '') {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect AI Planner</title><style>body{font:16px system-ui;background:#f8f9fa;color:#202124;margin:0;padding:7vh 24px}main{max-width:440px;margin:auto;padding:32px;background:white;border:1px solid #dadce0;border-radius:20px}h1{font-size:28px}label{display:block;margin:20px 0 8px}input,button{box-sizing:border-box;width:100%;padding:12px;border:1px solid #dadce0;border-radius:8px;font:inherit}button{margin-top:24px;background:#1a73e8;color:white;border:0}small{color:#5f6368}.error{color:#b3261e}</style><main><small>AI PLANNER · ACCOUNT CONNECTION</small><h1>Connect your planner</h1><p><strong>${escape(name)}</strong> requests permission to:</p><ul>${scope.split(' ').map(s => `<li>${s === 'planner:read' ? 'Read your calendar, folders, files and activity' : s === 'planner:write' ? 'Save deadlines, notes, folders and chat links' : 'Open and read your saved cloud browser session'}</li>`).join('')}</ul><p>Browser recordings remain off. Browser Use sessions have usage costs. You can disconnect this connection from the planner.</p>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}<form method="post" action="/api/mcp/oauth/authorize"><input type="hidden" name="request_id" value="${escape(id)}"><label for="username">Planner username</label><input id="username" name="username" autocomplete="username" required maxlength="24"><label for="password">Planner password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Authorize planner access</button></form><p><small>Sign in to AI Planner, not your OpenAI account. Close this window to cancel.</small></p></main></html>`, { headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'Referrer-Policy':'same-origin', 'X-Content-Type-Options':'nosniff' } })
}
export async function oauthRoute(request: Request, path: string): Promise<Response> {
  if (path.startsWith('/api/.well-known/oauth-protected-resource')) return json({ resource: MCP_RESOURCE, authorization_servers:[MCP_ORIGIN], scopes_supported:MCP_SCOPES, resource_name:'AI Planner' })
  if (path === '/api/.well-known/oauth-authorization-server') return json({ issuer:MCP_ORIGIN, authorization_endpoint:`${MCP_ORIGIN}/api/mcp/oauth/authorize`, token_endpoint:`${MCP_ORIGIN}/api/mcp/oauth/token`, registration_endpoint:`${MCP_ORIGIN}/api/mcp/oauth/register`, revocation_endpoint:`${MCP_ORIGIN}/api/mcp/oauth/revoke`, scopes_supported:MCP_SCOPES, response_types_supported:['code'], grant_types_supported:['authorization_code','refresh_token'], token_endpoint_auth_methods_supported:['none'], code_challenge_methods_supported:['S256'], authorization_response_iss_parameter_supported:true })
  if (path === '/api/mcp/oauth/register' && request.method === 'POST') {
    const input = await body(request)
    if (!Array.isArray(input.redirect_uris) || !input.redirect_uris.length || input.redirect_uris.length > 5 || !input.redirect_uris.every(validRedirect) || (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none')) throw new ApiError(400, 'Use an OpenAI or loopback OAuth callback and public-client PKCE authentication.')
    const clientId = `planner_${randomUUID()}`, name = typeof input.client_name === 'string' ? input.client_name.slice(0,100) : 'ChatGPT'
    storage(await db().from('planner_mcp_clients').insert({ id:clientId, name, redirect_uris:input.redirect_uris }))
    return json({ client_id:clientId, client_name:name, redirect_uris:input.redirect_uris, token_endpoint_auth_method:'none', grant_types:['authorization_code','refresh_token'], response_types:['code'] },201)
  }
  if (path === '/api/mcp/oauth/authorize' && request.method === 'GET') {
    const p = new URL(request.url).searchParams
    const client = storage(await db().from('planner_mcp_clients').select('*').eq('id',p.get('client_id') || '').maybeSingle())
    const redirect = p.get('redirect_uri') || '', state = p.get('state') || '', challenge = p.get('code_challenge') || ''
    const scope = (p.get('scope') || MCP_SCOPES.join(' ')).split(' ').filter(Boolean)
    if (!client || !client.redirect_uris.includes(redirect) || !validRedirect(redirect) || p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 2000 || p.get('resource') !== MCP_RESOURCE || !scope.length || scope.some(s => !MCP_SCOPES.includes(s))) throw new ApiError(400, 'Invalid OAuth authorization request.')
    const browserToken = secret(), expires = new Date(Date.now()+600000).toISOString()
    const row = storage(await db().from('planner_mcp_requests').insert({ client_id:client.id, redirect_uri:redirect, state, challenge, scope:[...new Set(scope)].join(' '), browser_hash:tokenHash(browserToken), expires_at:expires }).select('id').single())
    const response = formPage(row.id,client.name,scope.join(' '))
    response.headers.set('Set-Cookie',`planner-mcp-${row.id}=${browserToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/mcp/oauth; Max-Age=600`)
    return response
  }
  if (path === '/api/mcp/oauth/authorize' && request.method === 'POST') {
    const sameOrigin = request.headers.get('origin') === MCP_ORIGIN || (request.headers.get('origin') === 'null' && request.headers.get('sec-fetch-site') === 'same-origin')
    if (!sameOrigin) throw new ApiError(403, 'Return to the planner authorization page.')
    const raw = await request.text()
    if (raw.length > 4096) throw new ApiError(413,'Invalid authorization form.')
    const form = new URLSearchParams(raw), id = form.get('request_id') || ''
    const row = storage(await db().from('planner_mcp_requests').select('*').eq('id',id).gt('expires_at',new Date().toISOString()).maybeSingle())
    const cookie = request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(`planner-mcp-${id}=`))?.split('=')[1] || ''
    if (!row || !cookie || !timingSafeEqual(Buffer.from(row.browser_hash),Buffer.from(tokenHash(cookie)))) throw new ApiError(403,'The connection request expired. Start again from ChatGPT.')
    const username = normalizeUsername(form.get('username') || ''), password = form.get('password') || ''
    const account = username ? storage(await db().from('planner_accounts').select('password_hash').eq('username',username).maybeSingle()) : null
    if (!account || password.length > 256 || !verifyPassword(password,account.password_hash)) {
      const client = storage(await db().from('planner_mcp_clients').select('name').eq('id',row.client_id).single())
      return formPage(id,client.name,row.scope,'Wrong planner username or password.')
    }
    const consumed = storage(await db().from('planner_mcp_requests').delete().eq('id',id).eq('browser_hash',tokenHash(cookie)).select('id').maybeSingle())
    if (!consumed) throw new ApiError(409,'This connection request was already used.')
    const code = secret()
    storage(await db().from('planner_mcp_codes').insert({ code_hash:tokenHash(code), username, client_id:row.client_id, redirect_uri:row.redirect_uri, challenge:row.challenge, scope:row.scope, expires_at:new Date(Date.now()+120000).toISOString() }))
    const redirect = new URL(row.redirect_uri)
    redirect.searchParams.set('code',code); redirect.searchParams.set('state',row.state); redirect.searchParams.set('iss',MCP_ORIGIN)
    return new Response(null,{status:303,headers:{Location:redirect.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':`planner-mcp-${id}=; HttpOnly; Secure; SameSite=Lax; Path=/api/mcp/oauth; Max-Age=0`}})
  }
  if (path === '/api/mcp/oauth/token' && request.method === 'POST') {
    const raw = await request.text()
    if (raw.length > 8192) throw new ApiError(413,'Invalid token request.')
    const p = new URLSearchParams(raw), access = secret(), refresh = secret()
    if (p.get('resource') !== MCP_RESOURCE) return json({error:'invalid_target'},400)
    let rows: {username:string;scope:string}[]
    if (p.get('grant_type') === 'authorization_code') {
      const verifier = p.get('code_verifier') || ''
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return json({error:'invalid_grant'},400)
      rows = storage(await db().rpc('planner_mcp_exchange',{p_code:tokenHash(p.get('code') || ''),p_client:p.get('client_id') || '',p_redirect:p.get('redirect_uri') || '',p_challenge:createHash('sha256').update(verifier).digest('base64url'),p_access:tokenHash(access),p_refresh:tokenHash(refresh)}))
    } else if (p.get('grant_type') === 'refresh_token') {
      rows = storage(await db().rpc('planner_mcp_refresh',{p_old:tokenHash(p.get('refresh_token') || ''),p_client:p.get('client_id') || '',p_access:tokenHash(access),p_refresh:tokenHash(refresh)}))
    } else return json({error:'unsupported_grant_type'},400)
    if (!rows.length) return json({error:'invalid_grant'},400)
    return json({access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:rows[0].scope})
  }
  if (path === '/api/mcp/oauth/revoke' && request.method === 'POST') {
    const p = new URLSearchParams((await request.text()).slice(0,8192)), hash = tokenHash(p.get('token') || '')
    storage(await db().from('planner_mcp_tokens').update({revoked_at:new Date().toISOString()}).eq('client_id',p.get('client_id') || '').or(`token_hash.eq.${hash},refresh_hash.eq.${hash}`))
    return json({ok:true})
  }
  throw new ApiError(404,'Unknown planner connection endpoint.')
}

export async function mcpIdentity(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /,'') || ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  return storage(await db().from('planner_mcp_tokens').select('username,scope,id').eq('token_hash',tokenHash(token)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle())
}
