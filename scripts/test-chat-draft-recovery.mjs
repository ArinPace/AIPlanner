import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 for(const mode of ['verified','manual','unverified','unrecognized','changed']){
  const page=await browser.newPage({viewport:{width:393,height:852}});page.setDefaultTimeout(10000)
  const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace("if(input.action==='file_start')", "if(input.action==='tool_begin')value={instructions:'Reply to the user.'};else if(input.action==='tool_finish')value={ok:true};else if(input.action==='relay_draft_check'){globalThis.draftChecks++;value={safeToClear:globalThis.draftMode!=='unverified'}}else if(input.action==='file_start')")
  await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
  await page.addInitScript(mode=>{
   window.draftMode=mode;window.draftChecks=0;window.sends=0;window.clears=0;window.sent=false
   const raw='[Planner relay receipt: a1111111-1111-4111-8111-111111111111]\nPlanner app integration instructions:\nFixture\n\nCurrent user request:\nEarlier question\n\nFile delivery (only when returning requested files): Fixture\n\nPlanner relay response ID: b1111111-1111-4111-8111-111111111111.'
   window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=8
   window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{
    if(input.action==='chatGPTRelaySend'){if(++window.sends===1)throw Error('ChatGPT has an unsent draft. Open the session and send or clear it first.');window.sent=true;return {ok:true}}
    if(input.action==='chatGPTRelayDraft')return {text:mode==='unrecognized'?'My manual note':raw,manual:mode==='manual'}
    if(input.action==='chatGPTRelayClearDraft'){window.clears++;assertExpected(input.expected);if(mode==='changed')throw Error('The draft changed. Read it again.');return {ok:true}}
    if(input.action==='chatGPTRelayStatus')return {ready:true,phase:window.sent?'completed':'idle',text:window.sent?'Recovered safely.':''}
    return {ok:true}
   }}}}
   function assertExpected(value){if(value!==raw)throw Error('Must compare the exact draft before clearing')}
  },mode)
  await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174')
  await page.getByRole('button',{name:'Open Main Chat',exact:true}).click()
  const chat=page.getByRole('dialog',{name:'Main Chat',exact:true}),input=chat.getByRole('textbox',{name:'Message ChatGPT'})
  await input.fill('Current authorized question');await chat.getByRole('button',{name:'Send message',exact:true}).click()
  if(mode==='verified')await chat.getByText('Recovered safely.',{exact:true}).first().waitFor()
  else{await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-chat-attempts')||'[]').some(a=>a.status==='failed'));assert.equal(await input.inputValue(),'Current authorized question')}
  const state=await page.evaluate(()=>({sends:window.sends,clears:window.clears,checks:window.draftChecks}))
  assert.deepEqual(state,{sends:mode==='verified'?2:1,clears:['verified','changed'].includes(mode)?1:0,checks:['manual','unrecognized'].includes(mode)?0:1},mode)
  await page.close()
 }
 console.log('Generated stale draft recovery, manual preservation, verification refusal, exact-draft race protection, and single retry passed.')
}finally{await browser.close()}
