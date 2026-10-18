import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {slackDmUrl,listSlackDms,readSlackDm} from './slack-messages.mjs'
import {messagePermissionAllowed} from './message-permission.mjs'

test('Slack DM URLs and source consent are constrained',()=>{
 assert.equal(slackDmUrl('https://app.slack.com/client/T123/D456'),'https://app.slack.com/client/T123/D456')
 for(const u of ['https://evil.test/client/T123/D456','https://app.slack.com/client/T123/C456','https://app.slack.com/client/T123/D456?x=y','https://app.slack.com/client/T123/compose'])assert.throws(()=>slackDmUrl(u))
 assert.ok(messagePermissionAllowed({sources:['slack'],messageReadConsent:{slack:new Date().toISOString()}},'slack'))
 assert.ok(!messagePermissionAllowed({sources:['slack'],messageReadConsent:{}},'slack'))
 assert.ok(!messagePermissionAllowed({sources:[],messageReadConsent:{slack:new Date().toISOString()}},'slack'))
})
test('Slack DMs require exact person and workspace and exclude channel and composer text',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage()
  const shell='<button data-qa="team_sidebar_item" data-team="T123"><i data-qa="team-icon" aria-label="NYU Stern"></i></button><button data-qa="team_sidebar_item" data-team="T999"><i data-qa="team-icon" aria-label="Other"></i></button><a data-qa-channel-sidebar-channel-id="D456"><span data-qa="channel_sidebar_name">Alex</span></a><a href="/client/T123/C789">general</a>'
  await page.route('https://app.slack.com/**',route=>route.fulfill({contentType:'text/html',body:shell+(route.request().url().endsWith('/D456')?'<div data-qa="message_container" data-msg-ts="123.45">Selected DM body</div><div contenteditable="true">composer text</div>':'')}))
  await page.goto('https://app.slack.com/client/T123/C789')
  const list=await listSlackDms(page,'Stern',{timeout:1000})
  assert.deepEqual(list.threads,[{name:'Alex',url:'https://app.slack.com/client/T123/D456'}])
  await assert.rejects(()=>readSlackDm(page,{workspace:'Stern',name:'Al',timeout:1000}),/No unique exact/)
  await assert.rejects(()=>readSlackDm(page,{workspace:'Stern',url:'https://app.slack.com/client/T999/D456',timeout:1000}),/different workspace/)
  await assert.rejects(()=>readSlackDm(page,{workspace:'Missing',name:'Alex',timeout:1000}),/No unique connected/)
  const result=await readSlackDm(page,{workspace:'Stern',name:'Alex',timeout:1000})
  assert.deepEqual(result.messages,[{text:'Selected DM body',timestamp:'123.45'}])
  assert.ok(!JSON.stringify(result).includes('composer text'))
 }finally{await browser.close()}
})
