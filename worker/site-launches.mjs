import { readFile, writeFile, rename, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { brightspaceCourse } from './site-status.mjs'
import { sources } from './browser-sources.mjs'
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
  const saved=JSON.parse(await readFile(path.join(dataDir,'site-launches.json'),'utf8').catch(()=>'{}'))
  if(saved.browserProfileVersion!==1){
    // Retain existing sessions without copying any cookies. A future explicit
    // reconnect moves only that source to the normal Chrome profile.
    const legacy=await stat(path.join(dataDir,'browser','Default')).then(s=>s.isDirectory()).catch(()=>false)
    const retained=legacy?Object.fromEntries(['brightspace','gradescope','gmail','drive','slack','instagram'].map(source=>[source,'legacy'])):{}
    saved.browserProfiles={...retained,...saved.browserProfiles}
    saved.browserProfileVersion=1
    await saveLaunches(dataDir,saved)
  }
  return saved
}
async function saveLaunches(dataDir,saved){
  const file=path.join(dataDir,'site-launches.json'),temporary=file+'.'+randomUUID()+'.tmp'
  await writeFile(temporary,JSON.stringify(saved),{mode:0o600});await rename(temporary,file)
}
export async function rememberBrowserProfile(dataDir,source) {
  if(!(source in sources))throw new Error('Choose a supported website.')
  const saved=await siteLaunches(dataDir)
  saved.browserProfiles={...saved.browserProfiles,[source]:'stable'}
  await saveLaunches(dataDir,saved)
}
export async function rememberLanding(dataDir, source, href) {
  const u = new URL(href)
  const url = source === 'slack' && u.origin === 'https://app.slack.com' && /^\/client\/[A-Z0-9]+\/[CDG][A-Z0-9]+\/?$/.test(u.pathname) ? u.origin+u.pathname : source === 'gradescope' ? brightspaceCourse(href) : googleAccountLanding(source,href)
  if (!url) return
  const saved = await siteLaunches(dataDir)
  if (saved[source] === url) return
  saved[source]=url
  await saveLaunches(dataDir,saved)
}
