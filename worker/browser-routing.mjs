import { sources,albertHosts } from './browser-sources.mjs'
export const googleSources = new Set(['gmail','calendar','drive'])
export const googleCdp = 'http://127.0.0.1:9223'
export function stableProfile(source, profiles={}) {
  // Only explicitly retained old sessions use the legacy browser. Every new
  // connection (including future sites) defaults to regular Chrome.
  return source==='calendar' || source==='x' || profiles[source]!=='legacy'
}
export function loginUsesStableProfile(source,intent,profiles={}) {
  return intent!=='open' || stableProfile(source,profiles)
}
export function browserEndpoint(url,profiles={},registry=sources) {
  const host=new URL(url).hostname.replace(/^www\./,'')
  const source=Object.keys(registry).find(key=>new URL(registry[key]).hostname.replace(/^www\./,'')===host) || (host==='twitter.com'?'x':albertHosts.has(host)?'albert':['docs.google.com','forms.google.com','forms.gle'].includes(host)?'drive':null)
  if(!source)throw new Error('Unknown browser source.')
  return stableProfile(source,profiles) ? googleCdp : 'http://127.0.0.1:9222'
}
