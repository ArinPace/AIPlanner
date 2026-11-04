import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')
const hash=data=>crypto.createHash('sha256').update(data).digest('hex')
const files=[['relay.csv','text/csv',Buffer.from('marker,value\nrelay,7319\n')],['relay.zip','application/zip',Buffer.from('504b03041400000000000000000000000000000000000000000000000000','hex')],['relay.pdf','application/pdf',Buffer.from('%PDF-1.4\nfixture byte transport\n%%EOF')],['relay.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZYAAAAASUVORK5CYII=','base64')],['relay.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',Buffer.from('504b03041400000000000000000000000000000000000000000000000000444f4358','hex')],['relay.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',Buffer.from('504b03041400000000000000000000000000000000000000000000000000584c5358','hex')]]
// Container/header fixtures test byte transport only, not Office/PDF parsing or ChatGPT acceptance.
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{for(const [name,mime,bytes] of files){
 const page=await browser.newPage({viewport:{width:393,height:852}})
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
 await page.addInitScript(()=>{
  window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=2;let sent=false;window.relaySent=[]
  window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{
   if(input.action==='chatGPTRelayStatus')return {ready:true,phase:sent?'completed':'idle',text:sent?'File transport fixture response.':'',files:sent?[{key:'a1111111-1111-4111-8111-111111111111',name:window.relaySent[0].files[0].name}]:[]}
   if(input.action==='chatGPTRelaySend'){window.relaySent.push(input);sent=true;return {ok:true}}
   if(input.action==='chatGPTRelayDownload')return window.relaySent[0].files[0]
   return {ok:true}
  }}}}
 })
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Chat',exact:true}).click()
 await page.getByText('ChatGPT session ready',{exact:true}).waitFor()
 await page.locator('input[type=file][accept="*/*"]').setInputFiles({name,mimeType:mime,buffer:bytes})
 await page.getByRole('textbox',{name:'Message ChatGPT'}).fill('Transport fixture test, not a real AI reply.')
 await page.getByRole('button',{name:'Send message',exact:true}).click()
 await page.getByText('File transport fixture response.',{exact:true}).waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('a[href^="#planner-chat-file/"]').length===2)
 const sent=await page.evaluate(()=>window.relaySent[0]);assert.equal(hash(Buffer.from(sent.files[0].data.split(',')[1],'base64')),hash(bytes))
 const stored=await page.evaluate(()=>[...window.__plannerRelayFixtureFiles.values()].map(f=>Array.from(f.bytes)))
 assert.equal(stored.length,2);for(const data of stored)assert.equal(hash(Buffer.from(data)),hash(bytes))
 const downloadEvent=page.waitForEvent('download');await page.locator('a[href^="#planner-chat-file/"]').last().click();const download=await downloadEvent
 assert.equal(hash(fs.readFileSync(await download.path())),hash(bytes));await page.close();console.log(name+': input/native payload + returned file + saved download hashes match')
}}finally{await browser.close()}
