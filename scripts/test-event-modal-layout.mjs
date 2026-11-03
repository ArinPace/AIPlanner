import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 for(const viewport of [{width:320,height:568},{width:393,height:852},{width:430,height:932},{width:852,height:393},{width:1280,height:800}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width<900,hasTouch:viewport.width<900})
  await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
  await page.goto('http://127.0.0.1:5174')
  await page.getByRole('button',{name:'Create',exact:true}).filter({visible:true}).click()
  const dialog=page.getByRole('dialog',{name:'Calendar event',exact:true})
  await dialog.getByPlaceholder('Add title').fill('Walk from basement laundry room to dorm — a long event title')
  await dialog.getByLabel('Repeats',{exact:true}).selectOption('custom')
  const inspect=async()=>{
   const state=await page.locator('.event-modal').last().evaluate(form=>{
    const v=window.visualViewport,r=form.getBoundingClientRect(),close=form.querySelector('[aria-label="Close"]').getBoundingClientRect()
    const outside=[...form.querySelectorAll('input,select,textarea,button')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.left<r.left-1||b.right>r.right+1)}).map(e=>e.getAttribute('aria-label')||e.textContent||e.tagName)
    return {left:r.left,right:r.right,bottom:r.bottom,top:r.top,width:v.width,height:v.height,offset:v.offsetTop,overflow:form.scrollWidth-form.clientWidth,outside,closeRight:close.right}
   })
   assert.ok(state.left>=0&&state.right<=viewport.width+1,JSON.stringify(state))
   assert.ok(state.top>=state.offset-1&&state.bottom<=state.offset+state.height+1,JSON.stringify(state))
   assert.ok(state.overflow<=1,JSON.stringify(state));assert.deepEqual(state.outside,[])
  }
  await inspect()
  await dialog.locator('select').filter({has:page.locator('option[value="monthdates"]')}).selectOption('monthdates')
  await inspect()
  await dialog.getByRole('button',{name:'Save',exact:true}).scrollIntoViewIfNeeded()
  assert.equal(await dialog.getByRole('button',{name:'Save',exact:true}).isVisible(),true)
  await dialog.getByLabel('Event type',{exact:true}).selectOption('folder')
  await page.getByRole('dialog',{name:'Event folder',exact:true}).getByRole('button',{name:'+ Add event',exact:true}).click()
  await page.getByRole('dialog',{name:'Event inside folder',exact:true}).getByPlaceholder('Add title').fill('Nested event with a long title')
  await inspect()
  console.log(`Event editor fits ${viewport.width}×${viewport.height}: long title, custom repeat, save controls, nested folder editor`)
  await page.close()
 }
}finally{await browser.close()}
