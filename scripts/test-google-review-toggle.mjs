import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')})
 await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174')
 await page.evaluate(async()=>{
  const source=await (await fetch('/src/components/GoogleCalendarAccounts.tsx')).text();const reactURL=source.match(/from ["']([^"']*\/react[.]js[^"']*)["']/)[1];const React=(await import(reactURL)).default
  const dom=await import('/node_modules/.vite/deps/react-dom_client.js'+(reactURL.includes('?')?reactURL.slice(reactURL.indexOf('?')):''));const createRoot=dom.createRoot??dom.default.createRoot
  const {GoogleCalendarAccounts}=await import('/src/components/GoogleCalendarAccounts.tsx')
  const original=window.fetch;window.settingPatches=[];window.reviewRequired=false
  window.fetch=async(input,options)=>{if(String(input).endsWith('/api/calendar/google-sync')&&options?.method==='PATCH'){const value=JSON.parse(options.body);window.settingPatches.push(value);window.reviewRequired=value.requireGoogleReview;return new Response('{}',{headers:{'Content-Type':'application/json'}})}return original(input,options)}
  document.getElementById('root').style.display='none';const target=document.createElement('div');document.body.append(target)
  function Settings(){const [google,setGoogle]=React.useState({exportEnabled:false,requireGoogleReview:false,configured:true,connected:true,identity:'fixture@example.invalid',activeAccountId:'fixture',accounts:[]});window.setGoogleSettings=setGoogle;return React.createElement(GoogleCalendarAccounts,{google,refresh:async()=>setGoogle(current=>({...current,requireGoogleReview:window.reviewRequired}))})}
  createRoot(target).render(React.createElement(Settings))
 })
 const toggle=page.getByRole('checkbox',{name:'Require Google Calendar checks before updating Planner',exact:true})
 await toggle.waitFor();assert.equal(await toggle.isChecked(),false);await toggle.check();await page.waitForFunction(()=>window.settingPatches.length===1);await page.waitForFunction(()=>[...document.querySelectorAll('label')].filter(n=>n.textContent.includes('Require Google Calendar checks')).at(-1)?.querySelector('input')?.disabled===false)
 assert.equal(await toggle.isChecked(),true);await toggle.uncheck();await page.waitForFunction(()=>window.settingPatches.length===2)
 assert.deepEqual(await page.evaluate(()=>window.settingPatches),[{requireGoogleReview:true},{requireGoogleReview:false}])
 await page.evaluate(()=>window.setGoogleSettings(current=>({...current,exportEnabled:true})))
 await page.waitForFunction(()=>[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Require Google Calendar checks'))?.querySelector('input')?.disabled)
 assert.equal(await toggle.isChecked(),true)
 console.log('Optional Google review toggle saves independently; Google publishing always requires review passed.')
}finally{await browser.close()}
