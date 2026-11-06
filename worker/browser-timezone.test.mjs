import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {applyBrowserTimezone} from './browser-timezone.mjs'
test('saved browser pages and new tabs render Planner New York time instead of host timezone',async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLANNER_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,env:{...process.env,TZ:'Asia/Singapore'}})
 try{
  const context=await browser.newContext(),page=await context.newPage()
  await applyBrowserTimezone(context)
  assert.equal(await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),'America/New_York')
  const second=await context.newPage();await applyBrowserTimezone(context)
  assert.equal(await second.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),'America/New_York')
  assert.equal(await second.evaluate(()=>new Date('2026-11-05T12:00:00Z').getHours()),7)
 }finally{await browser.close()}
})
