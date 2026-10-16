export const googleSources = new Set(['gmail','calendar','drive'])
export const googleCdp = 'http://127.0.0.1:9223'
export function stableProfile(source, profiles={}) {
  return source==='calendar' || googleSources.has(source) && profiles[source]==='stable'
}
export function browserEndpoint(url,profiles={}) {
  const source={'mail.google.com':'gmail','calendar.google.com':'calendar','drive.google.com':'drive'}[new URL(url).hostname]
  return stableProfile(source,profiles) ? googleCdp : 'http://127.0.0.1:9222'
}
