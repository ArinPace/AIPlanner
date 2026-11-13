import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')
const hash=data=>crypto.createHash('sha256').update(data).digest('hex')
const mime={csv:'text/csv',zip:'application/zip',pdf:'application/pdf',png:'image/png',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}
const files=Object.entries(mime).map(([ext,type])=>['verification.'+ext,type,fs.readFileSync(new URL('../ios/AIPlannerUITests/Fixtures/Relay/verification.'+ext,import.meta.url))])
// Authored valid files test transport, local previews and download bytes. AI parsing is checked separately live.
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{for(const [name,mime,bytes] of files){
 const page=await browser.newPage({viewport:{width:393,height:852}})
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'canShare',{value:()=>false});window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=2;let sent=false;window.relaySent=[]
  window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{
   if(input.action==='chatGPTRelayStatus')return {ready:true,phase:sent?'completed':'idle',text:sent?'File transport fixture response.':'',files:sent?[{key:'a1111111-1111-4111-8111-111111111111',name:window.relaySent[0].files[0].name}]:[]}
   if(input.action==='chatGPTRelaySend'){window.relaySent.push(input);sent=true;return {ok:true}}
   if(input.action==='chatGPTRelayDownload')return window.relaySent[0].files[0]
   return {ok:true}
  }}}}
 })
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Chat',exact:true}).click()
 await page.locator('.assistant-chat-title').getByText('Connected',{exact:true}).waitFor()
 await page.locator('input[type=file][accept="*/*"]').setInputFiles({name,mimeType:mime,buffer:bytes})
 await page.getByRole('textbox',{name:'Message ChatGPT'}).fill('Transport fixture test, not a real AI reply.')
 await page.getByRole('button',{name:'Send message',exact:true}).click()
 await page.getByText('File transport fixture response.',{exact:true}).waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('a[href^="#planner-chat-file/"]').length===2)
 const sent=await page.evaluate(()=>window.relaySent[0]);assert.equal(hash(Buffer.from(sent.files[0].data.split(',')[1],'base64')),hash(bytes))
 const stored=await page.evaluate(()=>[...window.__plannerRelayFixtureFiles.values()].map(f=>Array.from(f.bytes)))
 assert.equal(stored.length,2);for(const data of stored)assert.equal(hash(Buffer.from(data)),hash(bytes))
 await page.locator('a[href^="#planner-chat-file/"]').last().click()
 const preview=page.getByRole('dialog',{name,exact:true});await preview.waitFor()
 assert.equal(await page.locator('iframe').count(),0)
 const markers={docx:'DOCX-7294',xlsx:'XLSX-5386',pptx:'PPTX-3841'}
 const ext=name.split('.').at(-1)
 if(markers[ext])await preview.getByText(markers[ext],{exact:false}).first().waitFor()
 if(ext==='pdf')await preview.locator('canvas').waitFor()
 await preview.getByRole('button',{name:'Download',exact:true}).click()
 await preview.getByRole('button',{name:'Save to Planner Files',exact:true}).waitFor()
 const downloadEvent=page.waitForEvent('download');await preview.getByRole('button',{name:'Open in another app / Save to device',exact:true}).click();const download=await downloadEvent
 assert.equal(hash(fs.readFileSync(await download.path())),hash(bytes));
 await preview.getByRole('button',{name:'Save to Planner Files',exact:true}).click()
 await preview.getByRole('button',{name:'Save to Files',exact:true}).click()
 await preview.getByText('Saved to Planner Files.',{exact:true}).waitFor()
 const saved=await page.evaluate(()=>fetch('/api/files').then(r=>r.json()))
 assert.ok(saved.documents.some(d=>d.kind==='attachment'&&d.name===name&&d.size===bytes.length))
 await page.close();console.log(name+': input/native payload + returned file + saved download hashes match')
}}finally{await browser.close()}
