export function allowedLivePath(url, token) {
  try { return new URL(url, 'http://127.0.0.1').pathname.startsWith('/' + token + '/') } catch { return false }
}
export function readableUrl(value, enabled, sources) {
  const url = new URL(value)
  const hosts = enabled.filter(s => sources[s]).map(s => new URL(sources[s]).hostname.replace(/^www\./, ''))
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.replace(/^www\./, '')) || /(?:logout|signout|delete|remove|unsubscribe|submit|checkout)/i.test(url.pathname)) throw new Error('Choose a read-only HTTPS page from an enabled website.')
  return url.href
}
