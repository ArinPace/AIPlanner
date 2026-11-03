import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true})
 await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;globalThis.__plannerFixtureWidgets=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  window.taskRequests=[];window.plannerNativeScreenTime=true
  window.webkit={messageHandlers:{plannerNative:{postMessage:async request=>{if(request.action==='taskScreenTime')window.taskRequests.push(request);return {ok:true}}}}}
 })
 await page.goto('http://127.0.0.1:5174')
 const button=page.getByRole('button',{name:'Screen Time for Widget current activity',exact:true})
 await button.click()
 const first=await page.evaluate(()=>taskRequests[0])
 assert.equal(first.account,'planner_test');assert.equal(first.task.sourceEventId,'widget-test')
 assert.ok(first.task.end>first.task.start);assert.equal(await page.getByRole('dialog').count(),0)
 await page.locator('.mobile-week-event').filter({hasText:'Widget current activity'}).click()
 const editor=page.getByRole('dialog',{name:'Calendar event',exact:true})
 await editor.getByLabel('End time',{exact:true}).fill('23:59')
 await editor.getByRole('button',{name:'Screen Time for Widget current activity',exact:true}).click()
 const second=await page.evaluate(()=>taskRequests[1])
 assert.deepEqual(second.task,first.task,'Blocking must use the saved occurrence, not unsaved editor changes')
 console.log('Task Screen Time checks passed: per-row native menu, active account, exact occurrence window, editor shortcut, no accidental event opening or unsaved-time scheduling.')
 await page.close()
}finally{await browser.close()}
