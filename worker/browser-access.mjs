import {albertHosts} from './browser-sources.mjs'
export function allowedLivePath(url, token) {
  try { return new URL(url, 'http://127.0.0.1').pathname.startsWith('/' + token + '/') } catch { return false }
}
export function readableSlackImageUrl(value) {
  const u = new URL(value)
  if (u.protocol !== 'https:' || u.hostname !== 'files.slack.com' || u.port || u.username || u.password || !/^\/files-(pri|tmb)\//.test(u.pathname)) throw new Error('Choose an image attachment displayed in the Slack message.')
  return u.href
}
export function readableUrl(value, enabled, sources) {
  const url = new URL(value)
  const hosts = enabled.filter(s => sources[s]).map(s => new URL(sources[s]).hostname.replace(/^www\./, ''))
  if (enabled.includes('albert') && sources.albert) hosts.push(...albertHosts)
  if (enabled.includes('drive') && sources.drive) hosts.push('docs.google.com','forms.google.com','forms.gle')
  // Brightspace uses this GET view for assignment instructions as well as the
  // upload form. Navigation exposes text only; this tool cannot fill or submit it.
  const assignmentView = enabled.includes('brightspace') && url.hostname === new URL(sources.brightspace).hostname && url.pathname === '/d2l/lms/dropbox/user/folder_submit_files.d2l' && [...url.searchParams].every(([key, value]) => ['db', 'grpid', 'isprv', 'bp', 'ou', 'cfql'].includes(key) && /^\d+$/.test(value))
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.replace(/^www\./, '')) || (!assignmentView && /(?:logout|signout|delete|remove|unsubscribe|submit|checkout)/i.test(url.pathname))) throw new Error('Choose a read-only HTTPS page from an enabled website.')
  return url.href
}
