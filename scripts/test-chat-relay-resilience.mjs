import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 for(const mode of ['receipt-failed','lost-ack','save-failed','double-send','file-provider-error']){
  const page=await browser.newPage({viewport:{width:393,height:852}});page.setDefaultTimeout(12000)
  const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace("if(input.action==='file_start')","if(input.action==='tool_begin')value={instructions:'Reply to the user.'};else if(input.action==='tool_finish')value={ok:true};else if(input.action==='file_start')")
  await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
  await page.addInitScript(mode=>{
   window.sends=0;window.saveCalls=0;window.mirrors=0;window.sent=false;const original=window.fetch
   window.fetch=async(input,options)=>{
    if(String(input).includes('/api/subscription-chat')&&options?.body){const action=JSON.parse(options.body).action
     if(mode==='receipt-failed'&&action==='relay_attempt_start')return Response.json({error:'Receipt unavailable'},{status:503})
     if(action==='relay_save'){window.saveCalls++;if(mode==='save-failed'&&!localStorage.getItem('fixture-save-fault-fired')){localStorage.setItem('fixture-save-fault-fired','true');return Response.json({error:'Saving temporarily unavailable'},{status:503})}}
    }return original(input,options)
   }
   window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=8
   window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{
    if(input.action==='chatGPTRelaySend'){window.sends++;window.sent=true;if(mode==='lost-ack')throw Error('The connection was interrupted after submission. Inspect the session.');await new Promise(r=>setTimeout(r,250));return {ok:true}}
    if(input.action==='chatGPTRelayDownload'&&mode==='file-provider-error')throw Error('ChatGPT could not download this file.');if(input.action==='chatGPTRelayMirror')window.mirrors++
    if(input.action==='chatGPTRelayStatus')return {ready:true,phase:window.sent?'completed':'idle',text:window.sent?'Saved exactly once.':'',files:mode==='file-provider-error'&&window.sent?[{key:'output:0',name:'result.csv'}]:[]}
    return {ok:true}
   }}}}
  },mode)
  await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174');await page.getByRole('button',{name:'Open Main Chat',exact:true}).click()
  const chat=page.getByRole('dialog',{name:'Main Chat',exact:true}),input=chat.getByRole('textbox',{name:'Message ChatGPT'}),send=chat.getByRole('button',{name:'Send message',exact:true})
  const prompt='Unicode café 東京 — first line\nSecond line';await input.fill(prompt);await send.waitFor({state:'visible'})
  await page.waitForFunction(()=>!document.querySelector('.subscription-compose .assistant-send').disabled)
  if(mode==='double-send')await chat.locator('form.assistant-compose').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
  else await send.click()
  if(mode==='receipt-failed'||mode==='lost-ack'){
   await input.waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('subscription-message').disabled)
   assert.equal(await input.inputValue(),prompt);assert.equal(await page.evaluate(()=>window.sends),mode==='receipt-failed'?0:1)
   await page.getByRole('button',{name:'Close Main Chat'}).click();await page.getByRole('button',{name:'Open Main Chat'}).click();assert.equal(await input.inputValue(),prompt)
  }else{
   if(mode==='save-failed'){
    const retry=chat.getByRole('button',{name:'Save reply',exact:true});await retry.waitFor();assert.equal(await send.isEnabled(),false)
    await page.reload();await page.getByRole('button',{name:'Open Main Chat'}).click();await retry.waitFor();await retry.click()
   }
   if(mode==='file-provider-error'){await chat.getByRole('button',{name:'Save reply without files',exact:true}).click()}
   await page.waitForFunction(()=>document.getElementById('subscription-message').value==='')
   assert.equal(await chat.getByText('Saved exactly once.',{exact:true}).count(),1)
   assert.equal(await page.evaluate(()=>window.sends),mode==='save-failed'?0:1,'Saving a recovered reply cannot send the prompt again')
   assert.equal(await page.evaluate(()=>window.mirrors),0,'Post-reply background menus must not steal the composer keyboard')
  }
  await page.close()
 }
 console.log('Receipt failure, lost submission acknowledgement, final-save recovery across reload, duplicate-send lock, provider download-error text recovery, and Unicode/multiline draft preservation passed.')
}finally{await browser.close()}
