import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { readBrowserPage } from './page-reader.mjs'
import { readGoogleDocument } from './google-doc-reader.mjs'
import { gmailContent } from './source-readiness.mjs'
import { slackChannels,findSlackChannel } from './source-readiness.mjs'
import { readableUrl } from './browser-access.mjs'
import { browserEndpoint } from './browser-routing.mjs'
import { selectedBrowserDestination } from './site-launches.mjs'
import { sources } from './browser-sources.mjs'

test('Docs/Forms share only the enabled Drive profile and selected account',()=>{
  for(const url of ['https://docs.google.com/document/d/abc/edit','https://docs.google.com/forms/d/e/abc/viewform','https://forms.gle/abc']){
    assert.equal(readableUrl(url,['drive'],sources),url)
    assert.throws(()=>readableUrl(url,['gmail'],sources))
    assert.equal(browserEndpoint(url,{drive:'legacy'}),'http://127.0.0.1:9222')
    assert.equal(browserEndpoint(url,{drive:'stable'}),'http://127.0.0.1:9223')
  }
  assert.equal(new URL(selectedBrowserDestination('https://docs.google.com/document/d/abc/edit',{drive:'https://drive.google.com/drive/u/2/my-drive'})).searchParams.get('authuser'),'2')
  assert.throws(()=>readableUrl('https://docs.google.com.evil.test/document/d/abc/edit',['drive'],sources))
  const assignment='https://brightspace.nyu.edu/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=629777&db=1223589&cfql=0'
  assert.equal(readableUrl(assignment,['brightspace'],sources),assignment)
  assert.throws(()=>readableUrl(assignment+'&submit=1',['brightspace'],sources))
})

test('Slack discovers public channel URLs from JavaScript sidebar rows and excludes DMs',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try{
    const page=await browser.newPage();await page.route('https://app.slack.com/**',r=>r.fulfill({body:'<div data-item-key="C123"><div class="p-channel_sidebar__channel"><span data-qa="channel_sidebar_name">2030</span></div></div><div data-item-key="D123"><div class="p-channel_sidebar__channel"><span data-qa="channel_sidebar_name">Private DM</span></div></div>'}));await page.goto('https://app.slack.com/client/E123/C123')
    assert.deepEqual(await slackChannels(page),[{name:'2030',url:'https://app.slack.com/client/E123/C123'}])
  }finally{await browser.close()}
})

test('Gmail waits for delayed search rows and exposes full-thread links, then waits for message bodies',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try{
    const context=await browser.newContext()
    await context.route('https://mail.google.com/**',r=>r.fulfill({contentType:'text/html',body:`<div role="main" aria-busy="true">Loading...</div><script>setTimeout(()=>{const n=document.querySelector('[role=main]');n.setAttribute('aria-busy','false');n.innerHTML=location.hash.includes('abcdef1234567890')?'<div class="a3s">Complete academic thread instructions and deadline</div>':'<table><tr class="zA"><td data-legacy-thread-id="abcdef1234567890">Academic inbox preview</td></tr></table>'},2500)</script>`}))
    const list=await readBrowserPage(context,'https://mail.google.com/mail/u/0/#search/entrepreneurship')
    assert.equal(list.gmail.rows.length,1)
    assert.match(list.gmail.rows[0].url,/#inbox\/abcdef1234567890$/)
    assert.match(list.coverage,/previews only/)
    const thread=await readBrowserPage(context,list.gmail.rows[0].url)
    assert.match(thread.text,/Complete academic thread/)
    assert.equal(thread.gmail.messages.length,1)
  }finally{await browser.close()}
})

test('Google Docs text export does not accept login HTML or unrelated redirect hosts',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try{
    const context=await browser.newContext()
    await context.route('https://docs.google.com/**',r=>r.fulfill({contentType:'text/html',body:'Document canvas shell'}))
    const original=context.request.get.bind(context.request)
    context.request.get=async(url,options)=>String(url).includes('/export?')?{status:()=>200,ok:()=>true,headers:()=>({'content-type':'text/plain'}),body:async()=>Buffer.from('Verified syllabus export content'),dispose:async()=>{}}:original(url,options)
    const doc=await readBrowserPage(context,'https://docs.google.com/document/d/fixture/edit')
    assert.equal(doc.text,'Verified syllabus export content')
    assert.match(doc.coverage,/document text export/)
    context.request.get=async()=>({status:()=>302,ok:()=>false,headers:()=>({location:'https://evil.test/'}),dispose:async()=>{}})
    const blocked=await readBrowserPage(context,'https://docs.google.com/document/d/fixture/edit')
    assert.equal(blocked.document.unavailable,true)
    assert.equal(blocked.text.trim(),'Document canvas shell')
  }finally{await browser.close()}
})

test('Sheets reads the selected CSV tab and preserves the chosen Google account',async()=>{
 const calls=[];const context={request:{get:async url=>{calls.push(String(url));return {ok:()=>true,status:()=>200,headers:()=>({'content-type':'text/csv'}),body:async()=>Buffer.from('Name,Team\nAda,8'),dispose:async()=>{}}}}};
 const result=await readGoogleDocument(context,'https://docs.google.com/spreadsheets/d/sheet123/edit?authuser=school%40example.com#gid=42');const url=new URL(calls[0]);assert.equal(url.searchParams.get('gid'),'42');assert.equal(url.searchParams.get('format'),'csv');assert.equal(url.searchParams.get('authuser'),'school@example.com');assert.match(result.text,/Ada,8/);assert.match(result.coverage,/Other tabs/);
 await readGoogleDocument(context,'https://docs.google.com/spreadsheets/d/other/edit');assert.equal(new URL(calls[1]).searchParams.has('gid'),false);
})
test('Gmail expands collapsed messages without treating attachments as read',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage();await page.setContent('<button aria-label="Expand all" onclick="document.querySelector(\'.kv\').className=\'a3s\'">Expand all</button><div class="a3s">First message</div><div class="kv">Earlier collapsed message</div><a download="syllabus.pdf">Download</a>');const result=await gmailContent(page,'gmail-thread');assert.equal(result.messages.length,2);assert.equal(result.collapsedMessages,0);assert.equal(result.attachments[0].read,false)}finally{await browser.close()}
})

test('exact Slack sidebar lookup finds an omitted public channel without returning DMs',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage();await page.route('https://app.slack.com/**',r=>r.fulfill({body:'<button data-qa="section_heading_button_plus__channels">Channels</button><input role="searchbox" aria-label="Channel or user name"><div data-item-key="C029FRLALCQ"><div class="p-channel_sidebar__channel">events</div></div><div data-item-key="D456"><div class="p-channel_sidebar__channel">events</div></div>'}));await page.goto('https://app.slack.com/client/E123/C456');const result=await findSlackChannel(page,'#events');assert.equal(result.channel.url,'https://app.slack.com/client/E123/C029FRLALCQ');await assert.rejects(()=>findSlackChannel(page,'events OR from:someone'));assert.equal((await findSlackChannel(page,'missing')).channel,null)}finally{await browser.close()}
})

test('modern Slack channel IDs and workspace selection never substitute another workspace',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage()
  await page.route('https://app.slack.com/**',r=>r.fulfill({body:'<button data-qa="team_sidebar_item" data-team="E123"><i data-qa="team-icon" aria-label="NYU Stern"></i></button><div class="p-channel_sidebar__channel" data-qa-channel-sidebar-channel-id="C123"><span data-qa="channel_sidebar_name_general">general</span></div><div class="p-channel_sidebar__channel" data-qa-channel-sidebar-channel-id="D123"><span data-qa="channel_sidebar_name_general">general</span></div>'}))
  await page.goto('https://app.slack.com/client/E123/C999')
  assert.deepEqual(await slackChannels(page),[{name:'general',url:'https://app.slack.com/client/E123/C123'}])
  const missing=await findSlackChannel(page,'general',{workspace:'BTE',timeout:1000})
  assert.equal(missing.code,'SLACK_WORKSPACE_UNAVAILABLE');assert.equal(missing.channel,null)
  assert.equal(missing.workspaces[0].name,'NYU Stern')
  const found=await findSlackChannel(page,'#general',{workspace:'NYU Stern',timeout:1000})
  assert.equal(found.channel.url,'https://app.slack.com/client/E123/C123')
  assert.equal((await findSlackChannel(page,'general',{workspace:'Stern',timeout:1000})).channel.url,found.channel.url)
 }finally{await browser.close()}
})
