import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const snapshot=swift.split('private var snapshotScript: String { """')[1].split('""" }')[0]
const composer=swift.split('// BEGIN_CHAT_COMPOSER_READER')[1].split('#"""\n')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}))
 await page.goto('https://chatgpt.com/c/fixture')
 await page.setContent(`<div contenteditable="true" data-composer-markdown=""></div><article><div data-message-author-role="assistant">Files ready.
 <span role="button" data-file-reference="true" aria-label="Download unchanged.zip">Download ZIP</span>
 <a href="/backend-api/estuary/content?file=fixture">PDF</a>
 <button aria-label="Download file">PNG</button></div><button aria-label="Copy">Copy</button></article>`)
 await page.evaluate(composer)
 const result=await page.evaluate(snapshot)
 assert.equal(result.count,1);assert.equal(result.final,true);assert.equal(result.files.length,3)
 assert.equal(new Set(result.files.map(f=>f.key)).size,3)
 assert.equal(await page.locator('[data-planner-download-id]').count(),3)
 console.log('Exact native snapshot discovers inline ZIP controls, file-card buttons and generated-file links in the completed assistant turn. DOM fixture only.')
}finally{await browser.close()}
