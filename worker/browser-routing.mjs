export const googleSources = new Set(['gmail','calendar','drive'])
export const googleCdp = 'http://127.0.0.1:9223'
export function stableProfile(source, profiles={}) {
  // X's Google OAuth popup inherits its opener's browser. It must start in
  // consumer Chrome too, rather than Chrome for Testing's automation launch.
  return source==='calendar' || source==='x' || googleSources.has(source) && profiles[source]==='stable'
}
export function browserEndpoint(url,profiles={}) {
  const source={'mail.google.com':'gmail','calendar.google.com':'calendar','drive.google.com':'drive','x.com':'x','www.x.com':'x','twitter.com':'x','www.twitter.com':'x'}[new URL(url).hostname]
  return stableProfile(source,profiles) ? googleCdp : 'http://127.0.0.1:9222'
}
