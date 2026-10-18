import {slackWorkspaces,slackMessages} from './source-readiness.mjs'

export function slackDmUrl(value){
 const u=new URL(value)
 if(u.origin!=='https://app.slack.com' || u.username || u.password || u.search || u.hash || !/^\/client\/[A-Z0-9]+\/D[A-Z0-9]+\/?$/.test(u.pathname))throw Error('Choose an existing Slack direct-message URL from the selected workspace.')
 return u.href
}
export async function slackDmThreads(page){
 return page.locator('[data-qa-channel-sidebar-channel-id],a[href*="/client/"]').evaluateAll(nodes=>{
  const team=location.pathname.match(/^\/client\/([A-Z0-9]+)/)?.[1],threads=new Map()
  if(!team)return []
  for(const n of nodes){
   let id=n.getAttribute('data-qa-channel-sidebar-channel-id')
   if(!/^D[A-Z0-9]+$/.test(id||''))try{const m=new URL(n.getAttribute('href'),location.href).pathname.match(/^\/client\/([A-Z0-9]+)\/(D[A-Z0-9]+)\/?$/);id=m?.[1]===team?m[2]:null}catch{continue}
   if(!id)continue
   const name=(n.querySelector('[data-qa="channel_sidebar_name"],[data-qa^="channel_sidebar_name_"],.p-channel_sidebar__name')?.textContent || n.textContent || '').trim().split('\n')[0]
   if(name && !threads.has(id))threads.set(id,{name:name.slice(0,200),url:location.origin+'/client/'+team+'/'+id})
  }
  return [...threads.values()].slice(0,100)
 })
}
export async function selectDmWorkspace(page,workspace,{timeout=30000}={}){
 await page.locator('[data-qa="team_sidebar_item"]').first().waitFor({state:'attached',timeout})
 const workspaces=await slackWorkspaces(page),normalize=s=>s.trim().toLocaleLowerCase()
 const exact=workspaces.filter(w=>normalize(w.name)===normalize(workspace))
 const matches=exact.length?exact:workspaces.filter(w=>(' '+normalize(w.name)+' ').includes(' '+normalize(workspace)+' '))
 if(matches.length!==1)throw Error('No unique connected Slack workspace matches. Choose its exact name: '+workspaces.map(w=>w.name).join(', '))
 const selected=matches[0]
 if(new URL(page.url()).pathname.split('/')[2]!==selected.id){
  await page.goto(selected.url,{waitUntil:'domcontentloaded',timeout})
 }
 await page.locator('[data-qa-channel-sidebar-channel-id],a[href*="/client/"]').first().waitFor({state:'attached',timeout})
 return selected
}
export async function listSlackDms(page,workspace,options){
 const selected=await selectDmWorkspace(page,workspace,options)
 const threads=await slackDmThreads(page)
 return {workspace:selected.name,threads,coverage:'Existing direct conversations listed in this workspace sidebar, up to 100. No message bodies returned. Collapsed or unloaded conversations may be missing.'}
}
export async function findSlackDm(page,name){
 const exact=async()=>(await slackDmThreads(page)).filter(t=>t.name===name)
 let matches=await exact()
 if(matches.length)return matches
 const search=page.getByRole('searchbox',{name:'Channel or user name'})
 if(!await search.isVisible())return []
 const initial=await search.inputValue()
 try{
  await search.fill(name,{timeout:5000})
  for(let i=0;i<10;i++){await page.waitForTimeout(300);matches=await exact();if(matches.length)return matches}
  return []
 }finally{await search.fill(initial).catch(()=>{})}
}
export async function readSlackDm(page,{workspace,name,url,timeout=30000,inspect}){
 if(Boolean(name)===Boolean(url))throw Error('Provide one exact conversation name or one existing DM URL.')
 if(url)slackDmUrl(url)
 const selected=await selectDmWorkspace(page,workspace,{timeout})
 let destination=url
 if(!destination){
  const matches=await findSlackDm(page,name)
  if(matches.length!==1)throw Error('No unique exact Slack DM matched. List the existing conversations and select its full name or URL.')
  destination=matches[0].url
 }
 if(new URL(destination).pathname.split('/')[2]!==selected.id)throw Error('The DM belongs to a different workspace. No conversation was opened.')
 await page.goto(destination,{waitUntil:'domcontentloaded',timeout})
 await page.waitForFunction(expected=>location.pathname.replace(/\/$/,'')===expected && !document.querySelector('[role="progressbar"]'),new URL(destination).pathname.replace(/\/$/,''),{timeout})
 await page.locator(slackMessages).first().waitFor({timeout})
 if(slackDmUrl(page.url()).replace(/\/$/,'')!==destination.replace(/\/$/,''))throw Error('Slack opened a different conversation. No messages were read.')
 const messages=await page.locator(slackMessages).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).slice(-50).map(n=>({text:n.innerText.slice(0,10000),timestamp:n.getAttribute('data-msg-ts') || n.getAttribute('data-item-key')})).filter(m=>m.text.trim()))
 if(!messages.length && !await page.locator(slackMessages).locator('img,canvas').count())throw Error('The selected DM has no readable rendered message bodies.')
 const result={workspace:selected.name,url:page.url(),messages,coverage:'Up to 50 rendered messages from the selected existing DM only. Older history, replies in unopened threads and unopened files are not covered. Opening may mark messages read. Nothing was sent.'}
 return inspect?await inspect(page,result,slackMessages,{limit:50}):result
}
