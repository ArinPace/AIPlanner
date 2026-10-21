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
 document.querySelector('[aria-label=Send]').onclick=()=>{const tools=box.innerText.includes('TEST_RENDERED_TOOLS');document.body.dataset.sent=box.innerText;box.textContent='';history.replaceState(null,'','/g/g-p-test/c/test');setTimeout(()=>{const reply=document.createElement('div');reply.dataset.markdownTextStyle='assistant-message';if(tools){reply.innerHTML='<table><tr><th>Check</th><th>Status</th></tr><tr><td>Relay</td><td>Ready</td></tr></table><pre><code></code></pre>';reply.querySelector('code').textContent=JSON.stringify({turn:'fixture-nonce',calls:[{id:'read',name:'planner_calendar_read',arguments:{}}]})}else reply.textContent='RELAY_CONFIRMED';document.body.append(reply)},300)};
 </script>`}))
 const planner=await context.newPage();await planner.goto('https://aiplanner-ten.vercel.app/')
 const post=value=>planner.evaluate(value=>send(value),value)
 const event=async(type,id)=>{await planner.waitForFunction(({type,id})=>events.some(e=>e.type===type&&(!id||e.id===id)),{type,id});return planner.evaluate(({type,id})=>events.findLast(e=>e.type===type&&(!id||e.id===id)),{type,id})}
 await post({type:'hello'});assert.equal((await event('ready')).extensionVersion,'0.3.1')
 // Pre-existing tabs are a required user path and avoid Edge's headless-only
 // pause of newly-created inactive extension tabs under request interception.
 const native=await context.newPage();await native.goto('https://chatgpt.com/')
 await native.evaluate(()=>document.title='Relay fixture')
 await post({type:'list-tabs'});const listing=await event('tabs')
 await post({type:'select-tab',tabId:listing.tabs.find(tab=>tab.title==='Relay fixture').id,chatId:'fixture-chat'})
 await planner.waitForFunction(()=>events.some(e=>e.selectedTitle==='Relay fixture'),null,{polling:100})
 await post({type:'new-chat',chatId:'fixture-chat'})
 await planner.waitForFunction(()=>events.some(e=>e.reason==='New chat ready in Ai Planner.'||e.type==='error')).catch(async error=>{console.log('Relay events',await planner.evaluate(()=>events));console.log('Pages',context.pages().map(p=>p.url()));console.log('Native tabs',await context.serviceWorkers()[0].evaluate(()=>chrome.tabs.query({url:'https://chatgpt.com/*'})));for(const page of context.pages())if(page.url().startsWith('https://chatgpt.com'))console.log('Native fixture',await page.locator('body').innerText());throw error})
 assert.equal(await planner.evaluate(()=>events.findLast(e=>e.type==='error')?.error),undefined)
 assert.equal(await native.locator('[role=textbox]').getAttribute('aria-label'),'New chat in Ai Planner')
 console.log('PASS current Choose project picker and new project chat')
 await post({type:'hide-chat'});assert.equal((await event('controlled')).action,'hide-chat')
 const worker=context.serviceWorkers()[0]
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
 await post({type:'connect'});await planner.waitForFunction(()=>events.some(e=>e.reason?.startsWith('A separate ChatGPT tab')),null,{polling:100})
 assert.equal((await worker.evaluate(async()=>{const s=await chrome.storage.session.get(null),id=Object.entries(s).find(([k])=>k.startsWith('chatTab:'))[1];return chrome.windows.get((await chrome.tabs.get(id)).windowId)})).state,'normal')
 console.log('PASS Open ChatGPT restores minimized window')
}finally{await context.close()}
