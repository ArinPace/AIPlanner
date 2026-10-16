import { readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { brightspaceCourse } from './site-status.mjs'
const googleSites={gmail:['mail.google.com','/mail'],calendar:['calendar.google.com','/calendar'],drive:['drive.google.com','/drive']}
export function googleAccountLanding(source,href) {
  try {
    const u=new URL(href),site=googleSites[source]
    if(!site || u.origin!=='https://'+site[0])return null
    const match=u.pathname.match(new RegExp('^'+site[1]+'/u/(\\d{1,3})(?:/|$)'))
    return match ? u.origin+site[1]+'/u/'+match[1]+'/' : null
  }catch{return null}
}
export function selectedBrowserDestination(href,saved) {
  const u=new URL(href)
  for(const source of Object.keys(googleSites)){
    const landing=googleAccountLanding(source,saved[source])
    if(landing && googleAccountLanding(source,href)) {
      const prefix=new URL(landing).pathname
      u.pathname=u.pathname.replace(/^\/(mail|calendar|drive)\/u\/\d{1,3}\//,prefix)
      return u.href
    }
  }
  return href
}
export async function siteLaunches(dataDir) {
  return JSON.parse(await readFile(path.join(dataDir,'site-launches.json'),'utf8').catch(()=>'{}'))
}
export async function rememberLanding(dataDir, source, href) {
  const u = new URL(href)
  const url = source === 'slack' && u.origin === 'https://app.slack.com' && /^\/client\/[A-Z0-9]+\/[CDG][A-Z0-9]+\/?$/.test(u.pathname) ? u.origin+u.pathname : source === 'gradescope' ? brightspaceCourse(href) : googleAccountLanding(source,href)
  if (!url) return
  const saved = await siteLaunches(dataDir)
  if (saved[source] === url) return
  saved[source]=url
  const file=path.join(dataDir,'site-launches.json')
  await writeFile(file+'.tmp',JSON.stringify(saved),{mode:0o600});await rename(file+'.tmp',file)
}
