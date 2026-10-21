// Real MV3 extension against controlled public-page fixtures; no account needed.
import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import path from 'node:path'
const extension=path.resolve('chat-extension')
const context=await chromium.launchPersistentContext('data/relay-regression-'+Date.now(),{
 channel:'msedge',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension],
})
try{
 await context.route('https://aiplanner-ten.vercel.app/**',route=>route.fulfill({contentType:'text/html',body:`
 <script>window.events=[];addEventListener('message',event=>{if(event.data?.source==='planner-device-relay')events.push(event.data)});window.send=value=>postMessage({source:'planner-chat-tab',...value},location.origin)</script>`}))
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`
 <button aria-pressed="true">Work</button><button id="choose" aria-label="Choose project">Choose project</button>
 <div role="textbox" contenteditable="true" aria-label="Work with ChatGPT"></div>
 <input type="file" multiple aria-label="Attach files"><button aria-label="Send">Send</button>
 <script>
 const box=document.querySelector('[role=textbox]');
 document.querySelector('#choose').onclick=()=>{const choice=document.createElement('div');choice.setAttribute('role','option');choice.textContent='Ai Planner';choice.onclick=()=>{box.setAttribute('aria-label','New chat in Ai Planner');choice.remove();document.querySelector('#choose').textContent='Ai Planner';document.querySelector('#choose').setAttribute('aria-label','Ai Planner')};document.body.append(choice)};
 document.querySelector('input').onchange=event=>{for(const file of event.target.files){const chip=document.createElement('span');chip.title=file.name;chip.textContent=file.name;document.body.append(chip)}};
 document.querySelector('[aria-label=Send]').onclick=()=>{const file=box.innerText.includes('TEST_FILE_CARD'),tools=box.innerText.includes('TEST_RENDERED_TOOLS'),login=box.innerText.includes('TEST_SIGN_IN');document.body.dataset.sent=box.innerText;box.textContent='';history.replaceState(null,'','/g/g-p-test/c/test');setTimeout(()=>{const reply=document.createElement('div');reply.dataset.markdownTextStyle='assistant-message';if(file){reply.dataset.chatgptSelectionMessageId='fixture-file-message';reply.innerHTML='<span class="group/resource-row"><span>syllabus.pdf</span><button aria-label="Open preview of syllabus.pdf"></button><button aria-label="Download file"></button></span>';reply.querySelector('[aria-label="Download file"]').onclick=()=>document.body.dataset.downloaded='syllabus.pdf'}else if(login){reply.textContent='Sign in required';const handoff=document.createElement('button');handoff.textContent='Take over to sign in';handoff.onclick=()=>{const password=document.createElement('input');password.type='password';document.body.append(password);handoff.textContent=String.fromCharCode(73,39,109,32,100,111,110,101);handoff.onclick=()=>{password.remove();handoff.remove();reply.textContent='SIGN_IN_RESUMED'}};document.body.append(handoff)}else if(tools){reply.innerHTML='<table><tr><th>Check</th><th>Status</th></tr><tr><td>Relay</td><td>Ready</td></tr></table><div data-code-block="true"><div data-markdown-copy="exclude">planner-tools</div><div data-code-block-source="true"><code></code></div></div>';reply.querySelector('code').textContent=JSON.stringify({turn:'fixture-nonce',calls:[{id:'read',name:'planner_calendar_read',arguments:{}}]})}else reply.textContent='RELAY_CONFIRMED';document.body.append(reply)},300)};
 </script>`}))
 const planner=await context.newPage();await planner.goto('https://aiplanner-ten.vercel.app/')
 const post=value=>planner.evaluate(value=>send(value),value)
 const event=async(type,id)=>{await planner.waitForFunction(({type,id})=>events.some(e=>e.type===type&&(!id||e.id===id)),{type,id});return planner.evaluate(({type,id})=>events.findLast(e=>e.type===type&&(!id||e.id===id)),{type,id})}
 await post({type:'hello'});assert.equal((await event('ready')).extensionVersion,'0.3.6')
 // Pre-existing tabs are a required user path and avoid Edge's headless-only
 // pause of newly-created inactive extension tabs under request interception.
 const native=await context.newPage();await native.goto('https://chatgpt.com/')
 await native.evaluate(()=>document.title='Relay fixture')
 const worker=context.serviceWorkers()[0]
 await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'});await chrome.scripting.executeScript({target:{tabId:tabs[0].id},func:()=>chrome.runtime.onMessage.addListener((message,_sender,respond)=>{if(message.type==='planner-relay-new-chat')respond({error:'Obsolete relay intercepted the request'})})})})
 await post({type:'list-tabs'});const listing=await event('tabs')
 await post({type:'select-tab',tabId:listing.tabs.find(tab=>tab.title==='Relay fixture').id,chatId:'fixture-chat'})
 await planner.waitForFunction(()=>events.some(e=>e.selectedTitle==='Relay fixture'),null,{polling:100})
 await post({type:'new-chat',chatId:'fixture-chat'})
 await post({type:'status'})
 await planner.waitForFunction(()=>events.some(e=>e.reason?.startsWith('Opening ChatGPT in Ai Planner')),null,{polling:100})
 await post({type:'send',id:'too-early',chatId:'fixture-chat',message:'Must not reach the composer'})
 assert.match((await event('error','too-early')).error,/still opening/)
 await planner.waitForFunction(()=>events.some(e=>e.reason==='New chat ready in Ai Planner.'||(e.type==='error'&&e.id!=='too-early'))).catch(async error=>{console.log('Relay events',await planner.evaluate(()=>events));console.log('Pages',context.pages().map(p=>p.url()));console.log('Native tabs',await context.serviceWorkers()[0].evaluate(()=>chrome.tabs.query({url:'https://chatgpt.com/*'})));for(const page of context.pages())if(page.url().startsWith('https://chatgpt.com'))console.log('Native fixture',await page.locator('body').innerText());throw error})
 assert.equal(await planner.evaluate(()=>events.findLast(e=>e.type==='error'&&e.id!=='too-early')?.error),undefined)
 assert.equal(await native.locator('[role=textbox]').getAttribute('aria-label'),'New chat in Ai Planner')
 console.log('PASS current Choose project picker and new project chat; obsolete listener cannot intercept versioned commands')
 await post({type:'hide-chat'});assert.equal((await event('controlled')).action,'hide-chat')
 const parked=await worker.evaluate(async()=>{const s=await chrome.storage.session.get(null),id=Object.entries(s).find(([k])=>k.startsWith('chatTab:'))[1];const tab=await chrome.tabs.get(id);return {discardable:tab.autoDiscardable,window:await chrome.windows.get(tab.windowId)}})
 assert.equal(parked.discardable,false);assert.equal(parked.window.type,'popup')
 console.log('PASS relay parked in dedicated popup with automatic discard disabled (headless ignores minimize state)')
 await post({type:'send',id:'file-check',chatId:'fixture-chat',message:'Read my attachment',attachments:[{name:'proof.txt',data:'data:text/plain;base64,UkVMQVlfT0s='}]})
 const done=await event('finish','file-check');assert.equal(done.error,undefined);assert.equal(done.reply,'RELAY_CONFIRMED')
 assert.equal(await native.locator('input').evaluate(async n=>n.files[0].text()),'RELAY_OK')
 console.log('PASS accepted attachment bytes and completed reply while minimized')
 // A page reload disconnects the UI port. The background must retain completion.
 await planner.reload();await post({type:'status'});assert.equal((await event('finish','file-check')).reply,'RELAY_CONFIRMED')
 console.log('PASS reply recovered after Planner page reload')
 await post({type:'send',id:'rendered-tools',chatId:'fixture-chat',message:'TEST_RENDERED_TOOLS'})
 const rendered=await event('finish','rendered-tools')
 assert.equal(rendered.error,undefined);assert.match(rendered.reply,/\| Check \| Status \|/)
 assert.match(rendered.reply,/```planner-tools\n/)
 const calls=JSON.parse(rendered.reply.match(/```planner-tools\n([\s\S]*?)\n```/)[1]);assert.equal(calls.turn,'fixture-nonce')
 console.log('PASS rendered ChatGPT code blocks preserve tool protocol and Markdown tables')
 await post({type:'send',id:'sign-in',chatId:'fixture-chat',message:'TEST_SIGN_IN'})
 await planner.waitForFunction(()=>events.some(e=>e.id==='sign-in'&&e.attention?.includes('sign-in needed')),null,{polling:100})
 await planner.waitForTimeout(6000)
 assert.equal(await planner.evaluate(()=>events.some(e=>e.id==='sign-in'&&e.type==='finish')),false)
 await native.getByRole('button',{name:'Take over to sign in',exact:true}).click()
 await post({type:'status'})
 await planner.waitForFunction(()=>events.some(e=>e.type==='ready'&&e.attention?.includes('Secure sign-in')),null,{polling:100})
 await native.getByRole('button',{name:"I'm done",exact:true}).click()
 assert.equal((await event('finish','sign-in')).reply,'SIGN_IN_RESUMED')
 console.log('PASS manual sign-in handoff stays pending and resumes after user completion')
 await post({type:'sign-in-window'})
 await planner.waitForFunction(()=>events.some(e=>e.type==='controlled'&&e.action==='sign-in-window'),null,{polling:100}).catch(async error=>{console.log('Sign-in window errors',await planner.evaluate(()=>events.filter(e=>e.type==='error')));throw error})
 assert.equal(await native.locator('#planner-return-control').count(),1)
 const signInState=await worker.evaluate(async()=>{
  const state=await chrome.storage.session.get(null),pair=Object.entries(state).find(([key])=>key.startsWith('signInOwner:'))
  const native=await chrome.tabs.get(Number(pair[0].slice('signInOwner:'.length))),planner=await chrome.tabs.get(pair[1])
  return {separate:native.windowId!==planner.windowId,plannerActive:planner.active,type:(await chrome.windows.get(native.windowId)).type}
 })
 assert.deepEqual(signInState,{separate:true,plannerActive:true,type:'popup'})
 // Dispatch the real runtime command from the mapped content-script context.
 const returned=await worker.evaluate(async()=>{
  const state=await chrome.storage.session.get(null),pair=Object.entries(state).find(([key])=>key.startsWith('signInOwner:'))
  return (await chrome.scripting.executeScript({target:{tabId:Number(pair[0].slice('signInOwner:'.length))},func:()=>chrome.runtime.sendMessage({type:'planner-relay-v036-return-planner'})}))[0].result
 })
 assert.equal(returned.ok,true)
 console.log('PASS secure window keeps Planner selected and mapped return action restores Planner')
 await post({type:'send',id:'file-card',chatId:'fixture-chat',message:'TEST_FILE_CARD'})
 await event('finish','file-card')
 await post({type:'status'})
 await planner.waitForFunction(()=>events.some(e=>e.type==='ready'&&e.downloads?.some(f=>f.name==='syllabus.pdf')),null,{polling:100})
 const file=await planner.evaluate(()=>events.findLast(e=>e.type==='ready'&&e.downloads?.length).downloads[0])
 await post({type:'download',fileId:file.id})
 await planner.waitForFunction(()=>events.some(e=>e.type==='controlled'&&e.action==='download'),null,{polling:100})
 assert.equal(await native.evaluate(()=>document.body.dataset.downloaded),'syllabus.pdf')
 console.log('PASS native file cards expose opaque download actions without session URLs')
 await post({type:'connect'});await planner.waitForFunction(()=>events.some(e=>e.reason?.startsWith('A separate ChatGPT tab')),null,{polling:100})
 assert.equal((await worker.evaluate(async()=>{const s=await chrome.storage.session.get(null),id=Object.entries(s).find(([k])=>k.startsWith('chatTab:'))[1];return chrome.windows.get((await chrome.tabs.get(id)).windowId)})).state,'normal')
 console.log('PASS Open ChatGPT restores minimized window')
}finally{await context.close()}
