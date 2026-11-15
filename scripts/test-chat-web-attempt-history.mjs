import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852}})
 await page.addInitScript(()=>localStorage.setItem('fixture-chat-attempts',JSON.stringify([{id:'a1111111-1111-4111-8111-111111111111',chat_id:'00000000-0000-4000-8000-000000000101',prompt:'An interrupted question',status:'failed',detail:'Connection interrupted',partial_reply:'A retained partial reply.',submitted_at:'2026-11-15T00:00:00Z',created_at:'2026-11-15T00:00:00Z',updated_at:'2026-11-15T00:01:00Z'}])))
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')})
 await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174')
 await page.getByRole('button',{name:'Open Main Chat',exact:true}).click()
 const chat=page.getByRole('dialog',{name:'Main Chat',exact:true})
 await chat.getByText('An interrupted question',{exact:true}).waitFor()
 assert.ok(await chat.getByText('A retained partial reply.',{exact:true}).isVisible())
 assert.ok(await chat.getByText('Interrupted · partial reply retained',{exact:true}).isVisible())
 console.log('Web history displays interrupted requests and retained partial replies.')
}finally{await browser.close()}
