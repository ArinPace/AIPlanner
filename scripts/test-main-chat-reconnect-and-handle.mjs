import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});page.setDefaultTimeout(15000)
 const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace('const subscriptionMessages=[]','const subscriptionMessages=[{id:"saved-reply",chat_id:"00000000-0000-4000-8000-000000000101",role:"assistant",content:"Saved chat remains available.",created_at:now}]')
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture+`;window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=9;window.sendCalls=0;window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{if(input.action==='chatGPTRelaySend')window.sendCalls++;return {ready:true,phase:'idle'}}}}};const fixtureFetch=window.fetch;window.fetch=async(input,options)=>{if(String(input).includes('/api/subscription-chat')&&(!options?.method||options.method==='GET')){if(window.failChat)throw TypeError('Fixture offline');if(window.serverFailures>0){window.serverFailures--;return new Response('{}',{status:503,headers:{'Content-Type':'application/json'}})}}return fixtureFetch(input,options)};`})
 await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174')
 const open=page.getByRole('button',{name:'Open Main Chat',exact:true});await open.click()
 const chat=page.getByRole('dialog',{name:'Main Chat',exact:true});await chat.getByText('Saved chat remains available.',{exact:true}).waitFor()
 await page.evaluate(()=>{window.failChat=true;window.dispatchEvent(new Event('focus'))})
 await chat.getByText('Connection interrupted. Reconnecting…',{exact:false}).waitFor()
 assert.equal(await chat.getByText('Saved chat remains available.',{exact:true}).isVisible(),true)
 await page.evaluate(()=>{window.failChat=false;window.dispatchEvent(new Event('online'))})
 await page.waitForFunction(()=>!document.querySelector('.chat-connection-notice'))
 assert.equal(await chat.locator('.assistant-error').count(),0)
 await page.evaluate(()=>{window.serverFailures=2;window.dispatchEvent(new Event('focus'))})
 await page.waitForFunction(()=>window.serverFailures===0);await page.waitForTimeout(600)
 assert.equal(await chat.locator('.assistant-error').count(),0);assert.equal(await page.evaluate(()=>window.sendCalls),0,'Reconnect must never resend ChatGPT messages')
 const handle=chat.getByRole('slider',{name:'Resize chat sheet',exact:true});let rect=await handle.boundingBox(),before=await chat.boundingBox()
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2+70,{steps:8});assert((await chat.boundingBox()).height<before.height-60);await page.mouse.up();assert.equal(await chat.isVisible(),true)
 rect=await handle.boundingBox();before=await chat.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2+before.height*.5,{steps:8});await page.mouse.up()
 await page.waitForFunction(()=>!document.querySelector('.main-ai-sheet[open]'))
 await open.click();await handle.waitFor();rect=await handle.boundingBox();before=await chat.boundingBox()
 const cdp=await page.context().newCDPSession(page),x=rect.x+rect.width/2,y=rect.y+rect.height/2
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+before.height*.5}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await page.waitForFunction(()=>!document.querySelector('.main-ai-sheet[open]'))
 console.log('Chat handle resizes and dismisses with mouse and touch; failed reads recover, retain history, clear warnings and never resend messages passed.')
}finally{await browser.close()}
