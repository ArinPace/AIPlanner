import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  window.plannerNativeScreenTime=true
  window.webkit={messageHandlers:{plannerNative:{postMessage:async message=>{
   if(message.action==='screenTimeStatus')return {completed:sessionStorage.getItem('setup-done')==='1',authorized:true,groups:sessionStorage.getItem('setup-done')?[{id:'group1',name:'Social media'}]:[],location:sessionStorage.getItem('setup-done')?'Library':null}
   if(message.action==='screenTimeSetup'){sessionStorage.setItem('setup-done','1');window.dispatchEvent(new Event('plannerScreenTimeChanged'))}
   return {ok:true}
  }}}}
 })
 await page.goto('http://127.0.0.1:5174')
 await page.getByRole('button',{name:'Screen Time',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'Cloud blocking',exact:true}).count(),0)
 await page.getByRole('button',{name:'Set up Screen Time',exact:true}).click()
 await page.getByRole('button',{name:'Edit setup',exact:true}).waitFor()
 await page.getByText('Social media',{exact:true}).waitFor();await page.getByText('Library',{exact:true}).waitFor()
 await page.reload();await page.getByRole('button',{name:'Screen Time',exact:true}).click()
 await page.getByRole('button',{name:'Edit setup',exact:true}).waitFor();await page.getByText('Social media',{exact:true}).waitFor()
 console.log('PASS: completion refresh, saved group/location summary, edit entry, reload persistence, no old mode tabs.')
}finally{await browser.close()}
