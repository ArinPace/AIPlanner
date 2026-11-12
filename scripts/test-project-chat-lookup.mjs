import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const script=fs.readFileSync('ios/AIPlanner/PlannerWebView.swift','utf8').split('// BEGIN_PROJECT_CHAT_LOOKUP')[1].split('#"""')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage();await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:'<main><a href="/c/main"><h3>Main Chat</h3><time>Yesterday</time></a><a href="https://evil.test/c/wrong">Main Chat</a><a href="/g/other/c/wrong">Main Chat</a></main>'}));await page.goto('https://chatgpt.com/g/test/project')
 const find=title=>page.evaluate(async({script,title})=>new Function('title',`return(async()=>{${script}})()`)(title),{script,title})
 assert.deepEqual(await find('Main Chat'),{url:'https://chatgpt.com/g/test/c/main'});assert.deepEqual(await find('Biology'),{url:null})
 await page.locator('main').evaluate(n=>n.insertAdjacentHTML('beforeend','<a href="/c/second">Main Chat</a>'))
 await assert.rejects(()=>find('Main Chat'),/Several Test conversations/)
 console.log('Public project lookup reuses exact titles, ignores timestamp/foreign links, and refuses duplicates. DOM fixture only.')
}finally{await browser.close()}
