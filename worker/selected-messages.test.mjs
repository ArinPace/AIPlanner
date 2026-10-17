import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {selectedMessageUrl,listMessageThreads,readSelectedMessages,checkMessageWall} from './selected-messages.mjs'
import {messagePermissionAllowed,messagePermissionText} from './message-permission.mjs'

test('message URL validation excludes compose, unlock, credentials, queries and lookalike origins',()=>{
 assert.equal(selectedMessageUrl('instagram','https://www.instagram.com/direct/t/123/'),'https://www.instagram.com/direct/t/123/')
 assert.equal(selectedMessageUrl('x','https://x.com/i/chat/123'),'https://x.com/i/chat/123')
 assert.equal(selectedMessageUrl('linkedin','https://www.linkedin.com/messaging/thread/2-abc/'),'https://www.linkedin.com/messaging/thread/2-abc/')
 for(const [source,url] of [['x','https://x.com/i/chat/pin'],['x','https://x.com/i/chat/new'],['x','https://x.com/messages/123?compose=true'],['instagram','https://www.instagram.com.evil.test/direct/t/123/'],['instagram','https://user:secret@www.instagram.com/direct/t/123/'],['whatsapp','https://web.whatsapp.com/']])assert.throws(()=>selectedMessageUrl(source,url))
 assert.equal(messagePermissionAllowed({sources:['x'],messageReadConsent:{x:new Date().toISOString()}},'x'),true)
 assert.equal(Boolean(messagePermissionAllowed({sources:['x'],messageReadConsent:{x:null}},'x')),false)
 assert.equal(Boolean(messagePermissionAllowed({sources:[],messageReadConsent:{x:new Date().toISOString()}},'x')),false)
 assert.match(messagePermissionText({x:new Date().toISOString()}),/not permission to override/)
})

test('Instagram selects one exact chat, omits other previews/composer, and never sends',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const context=await browser.newContext()
  const html=`<main><div role="button" onclick="history.pushState({},'', '/direct/t/123/');document.querySelector('#messages').hidden=false"><img alt="user-profile-picture"><span>Alex</span><div>Unselected preview</div></div><div role="button"><img alt="user-profile-picture"><span>Other person</span><div>Private other preview</div></div><div role="grid" id="messages" hidden><div role="row">Selected message text<time datetime="2026-10-18T01:00:00Z"></time></div></div><div contenteditable="true">Composer content</div></main>`
  await context.route('https://www.instagram.com/**',r=>r.fulfill({contentType:'text/html',body:html}))
  const listed=await listMessageThreads(context,'instagram')
  assert.deepEqual(listed.threads.map(t=>t.name),['Alex','Other person'])
  assert.ok(!JSON.stringify(listed).includes('Private other preview'))
  const result=await readSelectedMessages(context,'instagram',{name:'Alex'})
  assert.equal(result.messages.length,1);assert.equal(result.messages[0].text,'Selected message text')
  assert.ok(!JSON.stringify(result).includes('Composer content'));assert.equal(context.pages().length,0)
  await assert.rejects(()=>readSelectedMessages(context,'instagram',{name:'Missing'}),{code:'CONVERSATION_NOT_FOUND'})
  const page=await context.newPage();await page.route('https://x.com/**',r=>r.fulfill({body:'<div data-testid="pin-code-input-container" aria-label="Passcode"></div>'}));await page.goto('https://x.com/i/chat/pin/recovery')
  await assert.rejects(()=>checkMessageWall(page),{code:'MESSAGES_UNLOCK_REQUIRED'})
 }finally{await browser.close()}
})
