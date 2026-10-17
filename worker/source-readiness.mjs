export const slackMessages='[data-qa="message_container"][data-msg-ts], [data-message-id][data-item-key]'
export const isSlackWorkspace=url=>url.hostname==='app.slack.com' && /^\/client\//.test(url.pathname)
export const isSlackChannel=url=>isSlackWorkspace(url) && /^\/client\/[^/]+\/[CG][A-Z0-9]+\/?$/.test(url.pathname)

export async function slackChannels(page) {
  return page.locator('.p-channel_sidebar__channel,[data-qa="channel-sidebar-channel"],[data-qa^="channel_sidebar_name_"],[data-qa="channel_sidebar_name"],a[href*="/client/"]').evaluateAll(nodes=>{
    const workspace=location.pathname.match(/^\/client\/([A-Z0-9]+)/)?.[1]
    if(!workspace)return []
    const channels=new Map()
    for(const node of nodes){
      let id=null,current=node
      const href=node.getAttribute('href')
      if(href)try{id=new URL(href,location.href).pathname.match(/^\/client\/[^/]+\/([CG][A-Z0-9]+)\/?$/)?.[1]}catch{}
      for(let i=0;!id && current && i<5;i++,current=current.parentElement){
        for(const attr of ['data-qa-channel-sidebar-channel-id','data-channel-id','data-item-key','data-item-id','id']){
          const value=current.getAttribute(attr)||''
          const match=value.match(/^(?:channel[-_:])?([CG][A-Z0-9]+)$/)
          if(match){id=match[1];break}
        }
      }
      if(!id)continue
      const name=(node.querySelector('[data-qa="channel_sidebar_name"],[data-qa^="channel_sidebar_name_"],.p-channel_sidebar__name')?.textContent || node.textContent || '').trim().replace(/^#/,'').split('\n')[0].slice(0,100)
      if(name && !channels.has(id))channels.set(id,{name,url:location.origin+'/client/'+workspace+'/'+id})
    }
    return [...channels.values()].slice(0,100)
  })
}

export async function slackWorkspaces(page) {
  return page.locator('[data-qa="team_sidebar_item"][data-team]').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-team'),name:n.querySelector('[data-qa="team-icon"]')?.getAttribute('aria-label')?.trim(),url:location.origin+'/client/'+n.getAttribute('data-team')})).filter(w=>w.name && /^[A-Z0-9]+$/.test(w.id)))
}

export async function findSlackChannel(page,name,{workspace,timeout=30000}={}) {
  const selected=name.trim().replace(/^#/,'')
  if(!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(selected))throw new Error('Choose one exact public channel name.')
  await page.locator('[data-qa="team_sidebar_item"],.p-channel_sidebar__channel,[data-qa="channel-sidebar-channel"],[data-qa="section_heading_button_plus__channels"]').first().waitFor({state:'attached',timeout})
  await page.keyboard.press('Escape');await page.keyboard.press('Escape')
  const workspaces=await slackWorkspaces(page)
  if(workspace){
    const requested=workspace.trim().toLocaleLowerCase()
    const exact=workspaces.filter(w=>w.name.toLocaleLowerCase()===requested)
    const matches=exact.length?exact:workspaces.filter(w=>(' '+w.name.toLocaleLowerCase()+' ').includes(' '+requested+' '))
    if(matches.length!==1)return {channel:null,code:'SLACK_WORKSPACE_UNAVAILABLE',workspaces,coverage:'The requested workspace is not available in this saved Slack session. Connect that workspace through Add sites > Slack. No channel messages were read; a channel URL is not required.'}
    if(new URL(page.url()).pathname.split('/')[2]!==matches[0].id){await page.goto(matches[0].url,{waitUntil:'domcontentloaded',timeout});await page.locator('.p-channel_sidebar__channel,[data-qa="channel-sidebar-channel"]').first().waitFor({timeout})}
  }
  const result=matches=>({channel:matches.length===1?matches[0]:null,workspaces,coverage:matches.length===1?'Exact joined channel found. Read its URL to inspect messages.':'No unambiguous joined channel found in this workspace. No channel was joined and no direct messages were read.'})
  let matches=(await slackChannels(page)).filter(c=>c.name.toLowerCase()===selected.toLowerCase())
  if(matches.length)return result(matches)
  const filter=page.getByRole('searchbox',{name:'Channel or user name'})
  if(!await filter.isVisible())return result([])
  const initial=await filter.inputValue()
  try{
    await filter.fill(selected,{timeout:5000})
    for(let i=0;i<10;i++){
      await page.waitForTimeout(300)
      matches=(await slackChannels(page)).filter(c=>c.name.toLowerCase()===selected.toLowerCase())
      if(matches.length)return result(matches)
    }
    return result([])
  }finally{await filter.fill(initial).catch(()=>{})}
}

export async function waitForSource(page,target,{timeout=30000}={}) {
  const host=target.hostname
  if(host==='mail.google.com'){
    const thread=/^#(?:inbox|all|sent|starred|important|snoozed|label\/[^/]+|search\/[^/]+)\/(?:[a-f0-9]{12,}|[A-Za-z][A-Za-z0-9_-]{18,})(?:\?|$)/.test(target.hash)
    try{
      await page.waitForFunction(({thread})=>{
        if(document.querySelector('input[type="password"]'))return true
        const main=document.querySelector('[role="main"]')
        if(main?.getAttribute('aria-busy')==='true' || main?.querySelector('[aria-busy="true"],[role="progressbar"]'))return false
        if(thread)return [...document.querySelectorAll('.a3s')].some(n=>n.innerText?.trim())
        return document.querySelector('tr.zA') || /No conversations found|No results found|Your inbox is empty/i.test(document.querySelector('[role="main"]')?.innerText || '')
      },{thread},{timeout})
    }catch{const error=new Error('Gmail has not loaded the requested search or full thread. Inbox previews are not full-message coverage.');error.code='GMAIL_NOT_READY';throw error}
    return {kind:thread?'gmail-thread':'gmail-list'}
  }
  if(host==='docs.google.com' && target.pathname.startsWith('/forms/')){
    await page.locator('[role="listitem"],form [role="heading"],input[type="password"]').first().waitFor({timeout}).catch(()=>{const e=new Error('The Google Form has not loaded its questions.');e.code='FORM_NOT_READY';throw e})
    return {kind:'google-form'}
  }
  return null
}

export async function gmailContent(page,kind) {
  if(kind==='gmail-thread'){
    const expand=page.locator('[aria-label="Expand all"],[data-tooltip="Expand all"],[title="Expand all"]').first()
    if(await expand.isVisible().catch(()=>false)){
      await expand.click({timeout:5000})
      await page.waitForFunction(()=>!document.querySelector('.kv') && !document.querySelector('[role="main"] [role="progressbar"]'),null,{timeout:20000}).catch(()=>{})
    }
    const messages=await page.locator('.a3s').evaluateAll(nodes=>nodes.filter(n=>n.innerText?.trim()).slice(0,100).map(n=>({text:n.innerText.slice(0,20000),truncated:n.innerText.length>20000})))
    const collapsedMessages=await page.locator('.kv').count()
    const attachments=await page.locator('[download],a[href*="view=att"],[data-tooltip="Download"]').evaluateAll(nodes=>nodes.slice(0,100).map(n=>({name:n.getAttribute('download') || n.getAttribute('aria-label') || n.textContent?.trim() || 'Attachment',read:false})))
    return {messages,collapsedMessages,attachments,coverage:collapsedMessages?'Thread still contains '+collapsedMessages+' collapsed message(s); coverage is partial. Attachments have not been read.':'Loaded expanded message bodies (up to 100, 20,000 characters each; check truncated). Attachments, quoted content hidden by Gmail and unloaded history are not included.'}
  }
  const rows=await page.locator('tr.zA').evaluateAll(nodes=>nodes.slice(0,50).map(n=>{
    const child=n.querySelector('[data-legacy-thread-id]')
    const id=n.getAttribute('data-legacy-thread-id') || child?.getAttribute('data-legacy-thread-id')
    const base=location.href.split('#')[0]
    return {preview:n.innerText.slice(0,2000),url:id && /^[a-f0-9]{12,}$/i.test(id)?base+'#inbox/'+id:null}
  }))
  return {rows,coverage:'Loaded search/inbox previews only. Follow each relevant row URL to read full message bodies; this is not a completed email review.'}
}
