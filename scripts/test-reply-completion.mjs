import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const source=fs.readFileSync('ios/AIPlanner/PlannerWebView.swift','utf8')
const detection=source.slice(source.indexOf('    const last=replies.at(-1);'),source.indexOf('    const clean=last?.cloneNode(true);'))
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 const page=await browser.newPage()
 const check=()=>page.evaluate(code=>{const replies=[...document.querySelectorAll('[data-message-author-role="assistant"]')];return new Function('replies',code+';return !!turn?.querySelector(completionSelector)')(replies)},detection)
 await page.setContent('<div>'+ '<div>'.repeat(8)+'<div data-message-author-role="assistant">READY</div>'+'</div>'.repeat(8)+'<button aria-label="Read aloud"></button></div>')
 assert.equal(await check(),true)
 await page.locator('button').evaluateAll(nodes=>nodes.forEach(n=>n.remove()))
 assert.equal(await check(),false)
 await page.setContent('<div><div data-message-author-role="assistant"><button aria-label="Read aloud"></button>Old response</div><div>'+ '<div>'.repeat(8)+'<div data-message-author-role="assistant">Working</div>'+'</div>'.repeat(8)+'</div></div>')
 assert.equal(await check(),false)
 console.log('Deep completed response detected; pauses and older response controls rejected.')
} finally {await browser.close()}
