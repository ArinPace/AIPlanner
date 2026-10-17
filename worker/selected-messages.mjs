export const messageSites={instagram:{inbox:'https://www.instagram.com/direct/inbox/',thread:/^\/direct\/t\/[A-Za-z0-9_-]+\/?$/,rows:'main [role="button"]:has(img[alt="user-profile-picture"])',messages:'[role="grid"] [role="row"]'},x:{inbox:'https://x.com/messages',thread:/^\/(?:messages|i\/chat)\/[A-Za-z0-9_-]+\/?$/,rows:'[data-testid="conversation"],a[href*="/messages/"],a[href*="/i/chat/"]',messages:'[data-testid="messageEntry"]'},linkedin:{inbox:'https://www.linkedin.com/messaging/',thread:/^\/messaging\/thread\/[A-Za-z0-9_-]+\/?$/,rows:'.msg-conversation-listitem,a[href*="/messaging/thread/"]',messages:'.msg-s-message-list__event,.msg-s-event-listitem'}}

export function selectedMessageUrl(source,value){
 const site=messageSites[source];if(!site)throw Error('Choose Instagram, X or LinkedIn.')
 const url=new URL(value),origin=new URL(site.inbox).origin
 if(url.origin!==origin || url.username || url.password || url.search || url.hash || !site.thread.test(url.pathname) || /^\/i\/chat\/(?:pin|settings|new)(?:\/|$)/.test(url.pathname))throw Error('Choose an existing conversation URL returned by the inbox, not a login, passcode or compose page.')
 return url.href
}
function failure(code,message){const error=new Error(message);error.code=code;return error}
async function threadRows(page,source){
 const primary=source==='linkedin'?'.msg-conversation-listitem':source==='x'?'[data-testid="conversation"]':messageSites[source].rows
 const rows=page.locator(primary)
 return await rows.count()?rows:page.locator(messageSites[source].rows)
}
export async function checkMessageWall(page){
 const url=new URL(page.url())
 if(/\/(?:login|signin|checkpoint|challenge|authwall)(?:\/|$)/.test(url.pathname) || await page.locator('input[type="password"]:visible').count())throw failure('NEEDS_LOGIN','Sign into this service in your private browser.')
 if(/^\/i\/chat\/pin\//.test(url.pathname) || await page.locator('[data-testid="pin-code-input-container"]:visible').count())throw failure('MESSAGES_UNLOCK_REQUIRED','X encrypted messages need you to unlock them in the VM browser. Do not send the passcode to the agent; it cannot guess, reset or bypass it.')
}
async function inboxPage(context,source){
 const site=messageSites[source];if(!site)throw Error('Unsupported message source.')
 const page=await context.newPage()
 try{await page.goto(site.inbox,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(2500);await checkMessageWall(page);await page.locator(site.rows).first().waitFor({timeout:15000}).catch(()=>{});await checkMessageWall(page);return page}catch(error){await page.close();throw error}
}
export async function listMessageThreads(context,source){
 const page=await inboxPage(context,source)
 try{
  const threads=await (await threadRows(page,source)).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({name:(n.querySelector('.msg-conversation-listitem__participant-names')?.textContent || n.innerText || n.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0,150),url:n.closest('a[href]')?.href || n.querySelector('a[href]')?.href || null})).filter(n=>n.name).slice(0,30))
  return {source,threads:threads.map(t=>{let url=null;try{url=selectedMessageUrl(source,t.url)}catch{}return {...t,url}}),coverage:'Visible conversation names only, up to 30; previews and message bodies are not returned. No chat has been opened.'}
 }finally{await page.close()}
}
export async function readSelectedMessages(context,source,{name,url}={}){
 const site=messageSites[source];if(!site)throw Error('Unsupported message source.')
 if(Boolean(name)===Boolean(url))throw Error('Provide one exact conversation name or one conversation URL.')
 if(url)selectedMessageUrl(source,url)
 const page=url?await context.newPage():await inboxPage(context,source)
 try{
  if(url)await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000})
  else{
   const rows=(await threadRows(page,source)).filter({visible:true})
   const matches=await rows.evaluateAll((nodes,name)=>nodes.map((n,index)=>({index,name:(n.querySelector('.msg-conversation-listitem__participant-names')?.textContent || n.innerText || n.getAttribute('aria-label') || '').trim().split('\n')[0]})).filter(n=>n.name===name).map(n=>n.index),name)
   if(matches.length!==1)throw failure('CONVERSATION_NOT_FOUND','No unique exact conversation name matched. List the visible threads and select its full displayed name.')
   await rows.nth(matches[0]).click({timeout:10000})
  }
  await page.waitForTimeout(2000);await checkMessageWall(page)
  selectedMessageUrl(source,page.url())
  await page.locator(site.messages).first().waitFor({timeout:15000}).catch(()=>{})
  await checkMessageWall(page)
  const messages=await page.locator(site.messages).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length && !n.matches('[contenteditable="true"]')).slice(-30).map(n=>({text:n.innerText.slice(0,10000),timestamp:n.querySelector('time')?.getAttribute('datetime') || null})).filter(m=>m.text.trim()))
  if(!messages.length)throw failure('MESSAGE_CONTENT_UNAVAILABLE','The selected conversation opened but its message bodies were not readable. Do not count the inbox, composer or a loading screen as content coverage.')
  return {source,url:page.url(),messages,coverage:'Up to 30 rendered messages from the selected conversation only. Older/unloaded history and media are not covered. Opening can mark messages seen. No message was sent.'}
 }finally{await page.close()}
}
