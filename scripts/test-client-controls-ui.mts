import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}})
 await page.addInitScript({content:`globalThis.__name=(fn)=>fn;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{Object.assign(window,{plannerNativeScreenTime:true,plannerNativeChatGPTRelayVersion:6,webkit:{messageHandlers:{plannerNative:{postMessage:async(message:any)=>{if(message.action==='plannerClientScreenTime')return {state:{fingerprint:'a'.repeat(64),authorized:true,end:null},detail:{received:message.command.action}};return {ok:true}}}}}})})
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Calendar',exact:true}).waitFor()
 const run=(command:any,account='planner_test')=>page.evaluate(async({command,account})=>{const {executeClientResults}=await import('/src/lib/clientControls.ts');return executeClientResults([{id:'client-test',result:{structuredContent:{result:{requiresClient:true,clientAction:{version:1,issuedAt:new Date().toISOString(),command}}}}}],[{id:'client-test',name:'planner_client_control'}],account,'11111111-1111-4111-8111-111111111111')},{command,account})
 for(const tab of ['files','todo','work','agent','chat','screentime','calendar']){
  const result=await run({action:'ui_navigate',tab});assert.equal(result[0].result.executed,true,JSON.stringify(result));assert.equal(result[0].result.clientResult.tab,tab)
 }
 const calendar=await run({action:'ui_navigate',tab:'calendar',view:'month',date:'2037-01-01'});assert.equal(calendar[0].result.clientResult.view,'month')
 const settings=await run({action:'ui_settings',open:true});assert.equal(settings[0].result.clientResult.settingsOpen,true);await page.getByRole('dialog',{name:'Settings',exact:true}).getByRole('switch',{name:'Scale month view to duration'}).waitFor({state:'visible'})
 const original=(await run({action:'ui_read'}))[0].result.clientResult
 const expected={theme:original.theme,zoom:original.zoom,hiddenTypes:original.hiddenTypes}
 const changed=await run({action:'ui_preferences',expected,theme:original.theme==='dark'?'light':'dark',hiddenTypes:['planned']});assert.equal(changed[0].result.executed,true)
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),original.theme==='dark'?'light':'dark')
 assert.equal((await run({action:'ui_preferences',expected,theme:original.theme}))[0].result.isError,true)
 const latest=(await run({action:'ui_read'}))[0].result.clientResult
 await run({action:'ui_preferences',expected:{theme:latest.theme,zoom:latest.zoom,hiddenTypes:latest.hiddenTypes},theme:original.theme,hiddenTypes:original.hiddenTypes})
 await run({action:'ui_settings',open:false})
 assert.equal((await run({action:'ui_read'},'other-user'))[0].result.isError,true)
 assert.equal((await run({action:'screen_time_read'}))[0].result.clientResult.state.authorized,true)
 assert.equal((await run({action:'ui_navigate',tab:'work',javascript:'alert(1)'}))[0].result.isError,true)
 console.log('Real Planner UI navigation across all seven tabs, calendar date/view, Settings, account rejection, strict commands and native result forwarding passed with fixture data. OS enforcement requires native verification.')
}finally{await browser.close()}
