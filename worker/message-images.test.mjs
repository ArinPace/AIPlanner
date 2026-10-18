import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import sharp from 'sharp'
import {readWhatsApp} from './whatsapp-reader.mjs'
import {messageImages} from './message-images.mjs'
import {readSelectedMessages,messageSites} from './selected-messages.mjs'

const green=await sharp({create:{width:180,height:100,channels:3,background:'#00ff00'}}).png().toBuffer()
const preview=await sharp(green).resize(72,72).png().toBuffer()
const image=`<img width="180" height="100" alt="Schedule image" src="data:image/png;base64,${green.toString('base64')}">`

test('all five DM selectors return image pixels only from selected message rows',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  for(const source of ['whatsapp','slack','instagram','x','linkedin']){
   const page=await browser.newPage()
   const row=source==='whatsapp'?`<div class="message-in">${image}</div>`:source==='slack'?`<div data-qa="message_container">${image}</div>`:source==='instagram'?`<div role="grid"><div role="row">${image}</div></div>`:source==='x'?`<div data-testid="messageEntry">${image}</div>`:`<div class="msg-s-message-list__event"><div class="msg-s-event-listitem">${image}</div></div>`
   const selector=source==='whatsapp'?'.message-in':source==='slack'?'[data-qa="message_container"]':messageSites[source].messages
   await page.setContent(`<aside>${image}</aside>${row}<div contenteditable="true">${image}</div>`)
   const output=await messageImages(page,{source},selector)
   const result=JSON.parse(output.content[0].text)
   assert.equal(result.images.length,1,source);assert.deepEqual(result.automaticImages.attached,[0],source)
   const pixels=output.content.find(c=>c.type==='image');assert.ok(pixels,source)
   const pixel=await sharp(Buffer.from(pixels.data,'base64')).removeAlpha().raw().toBuffer()
   assert.deepEqual([...pixel.subarray(0,3)],[0,255,0],source)
   await page.close()
  }
 }finally{await browser.close()}
})

test('Instagram, X and LinkedIn image-only messages survive extraction before their page closes',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  for(const [source,url,html] of [
   ['instagram','https://www.instagram.com/direct/t/123/',`<div role="grid"><div role="row">${image}</div></div>`],
   ['x','https://x.com/messages/123',`<div data-testid="messageEntry">${image}</div>`],
   ['linkedin','https://www.linkedin.com/messaging/thread/123/',`<div class="msg-s-message-list__event">${image}</div>`],
  ]){
   const context=await browser.newContext();await context.route(url,r=>r.fulfill({contentType:'text/html',body:html}))
   const output=await readSelectedMessages(context,source,{url,inspect:messageImages})
   assert.ok(output.content.some(c=>c.type==='image'),source);assert.equal(context.pages().length,0)
   await context.close()
  }
 }finally{await browser.close()}
})

test('bounded automatic images, explicit image index and unloaded image failures are reported',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage();await page.setContent(`<div class="message">${image.repeat(6)}<img src="missing.png" width="180" height="100"></div>`)
  const output=await messageImages(page,{},'.message')
  assert.equal(output.content.filter(c=>c.type==='image').length,3)
  assert.deepEqual(JSON.parse(output.content[0].text).automaticImages.attached,[3,4,5])
  assert.deepEqual(JSON.parse(output.content[0].text).automaticImages.unavailable,[6])
  const selected=await messageImages(page,{},'.message',{imageIndex:0})
  assert.deepEqual(JSON.parse(selected.content[0].text).automaticImages.attached,[0])
  const absent=await messageImages(page,{},'.message',{imageIndex:99})
  assert.deepEqual(JSON.parse(absent.content[0].text).automaticImages.unavailable,[99])
 }finally{await browser.close()}
})

 test('current WhatsApp layout includes image-only message containers, not just text nodes',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{const context=await browser.newContext();await context.route('https://web.whatsapp.com/**',r=>r.fulfill({contentType:'text/html',body:'<div id="side"><input role="searchbox"><div id="pane-side"><span title="Course group">Course group</span></div></div><div id="main"><header><span title="Course group">Course group</span></header><div data-testid="msg-container"><div data-pre-plain-text="[10:00] Alex: ">Text</div></div><div data-testid="msg-container"><div data-testid="image-thumb"><img width="240" height="240" src="data:image/png;base64,'+preview.toString('base64')+'">'+image+'</div></div></div>'}));const output=await readWhatsApp(context,{chatName:'Course group',timeout:1000,inspect:messageImages});assert.equal(output.content.filter(c=>c.type==='image').length,1);assert.equal(JSON.parse(output.content[0].text).messages.length,2)}finally{await browser.close()}
 })
