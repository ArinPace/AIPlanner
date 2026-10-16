import { readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { brightspaceCourse } from './site-status.mjs'
export async function siteLaunches(dataDir) {
  return JSON.parse(await readFile(path.join(dataDir,'site-launches.json'),'utf8').catch(()=>'{}'))
}
export async function rememberLanding(dataDir, source, href) {
  const u = new URL(href)
  const url = source === 'slack' && u.origin === 'https://app.slack.com' && /^\/client\/[A-Z0-9]+\/[CDG][A-Z0-9]+\/?$/.test(u.pathname) ? u.origin+u.pathname : source === 'gradescope' ? brightspaceCourse(href) : null
  if (!url) return
  const saved = await siteLaunches(dataDir)
  if (saved[source] === url) return
  saved[source]=url
  const file=path.join(dataDir,'site-launches.json')
  await writeFile(file+'.tmp',JSON.stringify(saved),{mode:0o600});await rename(file+'.tmp',file)
}
