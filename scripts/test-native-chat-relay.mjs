import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true})
 await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  window.plannerNativeChatGPTPortal=true;window.nativeSends=[];let sent=false
  window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{
   if(input.action==='chatGPTRelayStatus')return {ready:true,needsLogin:false,phase:sent?'completed':'idle',text:sent?'Hello from the relay.':''}
   if(input.action==='chatGPTRelaySend'){window.nativeSends.push(input);sent=true;return {ok:true}}
   return {ok:true}
  }}}}
 })
 await page.goto('http://127.0.0.1:5174')
 await page.getByRole('button',{name:'Chat',exact:true}).click()
 await page.getByText('ChatGPT session ready',{exact:true}).waitFor()
 await page.getByRole('textbox',{name:'Message ChatGPT'}).fill('Say hi, please.')
 await page.getByRole('button',{name:'Send message',exact:true}).click()
 await page.locator('.assistant-reply').getByText('Hello from the relay.',{exact:true}).waitFor()
 await page.waitForFunction(()=>document.getElementById('subscription-message').value==='')
 assert.equal((await page.evaluate(()=>window.nativeSends)).length,1)
 assert.equal(await page.locator('iframe').count(),0)
 assert.equal(await page.locator('.assistant-user-message').getByText('Say hi, please.',{exact:true}).count(),1)
 console.log('Planner UI → native send → reply → cloud transcript fixture passed; no embedded chat UI')
}finally{await browser.close()}
