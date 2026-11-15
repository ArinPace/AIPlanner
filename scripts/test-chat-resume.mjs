import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852}});page.setDefaultTimeout(12000)
 let fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace("if(input.action==='file_start')","if(input.action==='relay_resume_check')value={canResume:true};else if(input.action==='tool_finish')value={ok:true};else if(input.action==='tool_begin'){globalThis.beginCalls++;value={instructions:'Fixture'}}else if(input.action==='file_start')")
 await page.addInitScript(()=>{
  localStorage.setItem('fixture-chat-attempts',JSON.stringify([{id:'a1111111-1111-4111-8111-111111111111',chat_id:'00000000-0000-4000-8000-000000000101',prompt:'One original request',status:'submitted',detail:'Responding…',partial_reply:'A retained partial',submitted_at:'2026-11-15T00:00:00Z',created_at:'2026-11-15T00:00:00Z',updated_at:'2026-11-15T00:00:01Z'}]))
  window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=9;window.sends=0;window.resumes=0;window.beginCalls=0;window.resumed=false
  window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{
   if(input.action==='chatGPTRelaySend'){window.sends++;throw Error('A resumed request must never be resent')}
   if(input.action==='chatGPTRelayResume'){window.resumes++;if(input.turnId!=='a1111111-1111-4111-8111-111111111111')throw Error('Wrong receipt');window.resumed=true;return {url:'https://chatgpt.com/g/g-p-fixture/c/same-thread'}}
   if(input.action==='chatGPTRelayStatus')return {ready:true,phase:window.resumed?'completed':'idle',text:window.resumed?'The existing reply recovered.':''}
   return {ok:true}
  }}}}
 })
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
 await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174');await page.getByRole('button',{name:'Open Main Chat',exact:true}).click()
 const chat=page.getByRole('dialog',{name:'Main Chat',exact:true})
 await chat.getByText('The existing reply recovered.',{exact:true}).first().waitFor()
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-chat-attempts')||'[]').some(a=>a.status==='completed'))
 assert.equal(await page.evaluate(()=>window.resumes),1);assert.equal(await page.evaluate(()=>window.sends),0);assert.equal(await page.evaluate(()=>window.beginCalls),0)
 assert.equal(await chat.getByRole('group',{name:'Your message'}).filter({hasText:'One original request'}).count(),1)
 console.log('An active receipt resumes into its saved reply exactly once, without re-sending, repeating tool setup, or duplicating the user message.')
}finally{await browser.close()}
