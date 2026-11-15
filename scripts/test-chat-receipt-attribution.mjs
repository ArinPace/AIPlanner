import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const source=fs.readFileSync('ios/AIPlanner/PlannerWebView.swift','utf8')
const snapshot=source.split('private var snapshotScript: String { """')[1].split('""" }')[0].replaceAll('\\\\','\\')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage();await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto('https://chatgpt.com/c/fixture')
 const receipt='[Planner relay receipt: A1111111-1111-4111-8111-111111111111]'
 await page.setContent('<textarea></textarea><div data-turn-key="current"><div data-talvt-turn-state="complete"><div data-content-search-unit-key="current:user"></div><div data-local-conversation-final-assistant="true"><div data-chatgpt-selection-message-id="current-reply"><div data-markdown-text-style="assistant-message">ACK-UNIQUE</div></div></div></div></div>')
 await page.evaluate(({receipt})=>{window.__plannerComposer=()=>document.querySelector('textarea');window.__plannerPendingPrompt=receipt+'\n\n'+'Long integration instructions '.repeat(2500);document.querySelector('[data-content-search-unit-key]').textContent=receipt+' Abbreviated integration instructions…'},{receipt})
 let value=await page.evaluate(snapshot);assert.equal(value.attributed,true);assert.equal(value.final,true);assert.equal(value.text,'ACK-UNIQUE')
 await page.locator('[data-content-search-unit-key]').evaluate(n=>n.textContent='[Planner relay receipt: B1111111-1111-4111-8111-111111111111] Older question')
 assert.equal((await page.evaluate(snapshot)).attributed,false)
 await page.locator('[data-content-search-unit-key]').evaluate(n=>n.textContent='Unrelated prompt without a receipt')
 assert.equal((await page.evaluate(snapshot)).attributed,false)
 await page.evaluate(receipt=>{const user=document.querySelector('[data-content-search-unit-key]');user.textContent=receipt+' Current request';document.body.insertBefore(user,document.querySelector('[data-turn-key]'))},receipt)
 assert.equal((await page.evaluate(snapshot)).attributed,true,'Work can mount the user request outside its assistant turn wrapper')
 await page.locator('[data-content-search-unit-key]').evaluate(n=>n.textContent='[Planner relay receipt: B1111111-1111-4111-8111-111111111111] Older question')
 assert.equal((await page.evaluate(snapshot)).attributed,false)
 console.log('Abbreviated current receipt accepted; different receipts and unrelated historical prompts rejected.')
}finally{await browser.close()}
