import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [320,393,768])for(const mode of ['cancelled','legacy-cancellation','long-failure']){
 const page=await browser.newPage({viewport:{width,height:852}})
 let finishRequests=0
 await page.addInitScript(({mode})=>{
  window.__nativeCalls=0
  window.webkit={messageHandlers:{plannerNative:{postMessage:async()=>{
   window.__nativeCalls++
   if(mode==='cancelled')return {cancelled:true}
   if(mode==='legacy-cancellation')throw Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.WebAuthenticationSession error 1.)')
   throw Error('GoogleAuthenticationFailure.'+'UnbrokenDiagnostic'.repeat(35))
  }}}}
 },{mode})
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.includes('/finish'))finishRequests++
  await route.fulfill({json:path==='/api/session'?{username:null}:path==='/api/auth/options'?{googleEnabled:true,pendingGoogle:false}:{}})
 })
 await page.goto('http://127.0.0.1:5174/')
 const button=page.getByRole('button',{name:'Continue with Google',exact:true})
 await button.waitFor()
 const before=await page.locator('.login-card').boundingBox()
 await page.getByLabel('Username or email').fill('arin')
 await button.click()
 await page.waitForFunction(()=>window.__nativeCalls===1&&!document.querySelector('.secondary-btn.login-submit').disabled)
 assert.equal(await page.getByLabel('Username or email').inputValue(),'arin','Cancellation must preserve typed account details')
 assert.equal(await page.getByRole('alert').count(),mode==='long-failure'?1:0)
 const after=await page.locator('.login-card').boundingBox()
 assert(Math.abs(before.width-after.width)<1,'Sign-in failure must not widen the card')
 assert(after.x>=0&&after.x+after.width<=width,'Card must fit the viewport')
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow')
 assert.equal(finishRequests,0,'Cancelled/failed authentication must not finish or create a session')
 if(width===393)await page.screenshot({path:'data/login-'+mode+'-fixed.png'})
 await page.close()
}
console.log('PASS cancellation, legacy Apple cancellation, and long genuine errors preserve layout and inputs at 320/393/768px.')
}finally{await browser.close()}
