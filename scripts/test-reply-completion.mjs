import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const source=fs.readFileSync('ios/AIPlanner/PlannerWebView.swift','utf8')
const snapshot=source.split('private var snapshotScript: String { """')[1].split('""" }')[0].replaceAll('\\\\','\\')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 const page=await browser.newPage();await page.route('https://chatgpt.com/**',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));await page.goto('https://chatgpt.com/c/fixture')
 const check=()=>page.evaluate(code=>{window.__plannerComposer=()=>document.querySelector('textarea');return eval(code)},snapshot)
 await page.setContent('<textarea></textarea><div>'+ '<div>'.repeat(8)+'<div data-message-author-role="assistant">READY</div>'+'</div>'.repeat(8)+'<button aria-label="Read aloud"></button></div>')
 assert.equal((await check()).final,true)
 await page.locator('button').evaluateAll(nodes=>nodes.forEach(n=>n.remove()))
 assert.equal((await check()).final,false)
 await page.setContent('<textarea></textarea><div><div data-message-author-role="assistant"><button aria-label="Read aloud"></button>Old response</div><div>'+ '<div>'.repeat(8)+'<div data-message-author-role="assistant">Working</div>'+'</div>'.repeat(8)+'</div></div>')
 assert.equal((await check()).final,false)
 const work=(prompt,reply,state='complete')=>`<div data-turn-key="turn-${prompt}"><div data-talvt-turn-state="${state}"><div data-content-search-unit-key="turn:0:user">${prompt}</div><div data-local-conversation-final-assistant="true"><div data-chatgpt-selection-message-id="reply-${prompt}"><div data-markdown-text-style="assistant-message">${reply}</div><button aria-label="Download file">Download</button></div></div><button aria-label="Read aloud"></button></div></div>`
 await page.setContent('<textarea></textarea>'+work('Previous request','Old Duo prompt'))
 await page.evaluate(()=>window.__plannerPendingPrompt='Download syllabus')
 assert.equal((await check()).attributed,false)
 await page.locator('body').evaluate((n,html)=>n.insertAdjacentHTML('beforeend',html),work('Download syllabus','Original syllabus PDF'))
 let result=await check();assert.equal(result.attributed,true);assert.equal(result.final,true);assert.equal(result.replyKey,'reply-Download syllabus');assert.equal(result.files.length,1)
 await page.locator('[data-talvt-turn-state]').last().evaluate(n=>n.setAttribute('data-talvt-turn-state','streaming'))
 assert.equal((await check()).final,false)
 await page.locator('[data-talvt-turn-state]').last().evaluate(n=>n.setAttribute('data-talvt-turn-state','complete'))
 await page.locator('[data-content-search-unit-key]').last().evaluate(n=>{n.textContent='Truncated instructions…';const b=document.createElement('button');b.textContent='Show more';b.onclick=()=>{n.textContent='Download syllabus'};n.append(b)})
 assert.equal((await check()).attributed,false);assert.equal((await check()).attributed,true)
 console.log('Completion: old virtualized replies rejected; current prompt, stable message ID, explicit Work completion and PDF card matched; truncated prompt expands safely.')
} finally {await browser.close()}
