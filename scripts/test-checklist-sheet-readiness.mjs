import {chromium} from 'playwright-core'
import fs from 'node:fs';import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});page.setDefaultTimeout(15000)
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace("path==='/api/files'","(path==='/api/files'||path.startsWith('/api/files/system-note'))")})
 await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174')
 await page.waitForFunction(()=>document.querySelectorAll('.checklist-sheet .apple-note-document').length===2)
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'To-do',exact:true}).click()
 const sheet=page.locator('.checklist-sheet[open]');await sheet.waitFor();assert.equal(await sheet.locator('.apple-note-document').count(),2)
 assert.equal(await sheet.getByText('Opening Notes...',{exact:true}).count(),0)
 const cb=sheet.locator('[data-checklist-active=true] input[type=checkbox]').first(),checked=await cb.isChecked()
 await cb.click();assert.equal(await cb.isChecked(),!checked)
 assert.equal(await page.evaluate(()=>document.activeElement?.matches('[contenteditable=true],textarea,input[type=number]')),false,'Checking must not focus the text editor')
 const title=await sheet.getByRole('heading',{name:'Tasks',exact:true}).boundingBox(),y=title.y+title.height/2
 const cdp=await page.context().newCDPSession(page)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:220,y}]})
 let prior=0
 for(const dx of [20,50,85,120,160,190]){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220-dx,y}]});await page.waitForTimeout(35)
  const x=await sheet.locator('.checklist-pages-track').evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41)
  assert(x<=prior+1&&x<0);prior=x
 }
 assert.equal(await sheet.getAttribute('aria-label'),'Tasks');await page.waitForTimeout(400)
 assert(Math.abs(await sheet.locator('.checklist-pages-track').evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41)-prior)<1,'Holding a half swipe must not snap')
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350)
 assert.equal(await sheet.getAttribute('aria-label'),'Work')
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y}]})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:270,y}]});await page.waitForTimeout(50)
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350)
 assert.equal(await sheet.getAttribute('aria-label'),'Tasks')
 await sheet.getByRole('button',{name:'Add item',exact:true}).click()
 assert.equal(await page.evaluate(()=>document.activeElement?.matches('[contenteditable=true]')),true,'Adding an item should still focus text intentionally')
 console.log('Both editors ready before opening; checkbox does not focus text; drag tracks continuously, holds halfway, and snaps on release passed.')
}finally{await browser.close()}
