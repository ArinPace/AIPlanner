import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852}})
 await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  window.plannerNativeChatGPTPortal=true;window.plannerNativeChatGPTRelayVersion=7;window.savedModel=null;window.modelCalls=[]
  const fallback=window.fetch;window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/agent/vm/model-options'){window.savedModel=JSON.parse(init.body).options;return Response.json({ok:true})}const response=await fallback(input,init);if(url.pathname==='/api/agent/vm'){const d=await response.json();d.settings.generation_options={};d.hosts=[{id:'host',online:true,capabilities:{signedIn:true,modelCatalog:[{model:'a',label:'Model A',efforts:['low','high'],tiers:[{id:'fast',label:'Fast'}]}]}}];return Response.json(d)}return response}
  window.webkit={messageHandlers:{plannerNative:{postMessage:async input=>{if(input.action==='chatGPTRelayStatus')return {ready:true,phase:'idle'};if(input.action==='chatGPTRelayModel'){window.modelCalls.push(input);return {summary:input.operation==='choose'?'Model B':'Model A',options:[{id:'b',label:'Model B',selected:input.operation==='choose',submenu:false}],sliders:[]}}return {ok:true}}}}}
 })
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Agent',exact:true}).click();await page.getByRole('button',{name:'Agent settings',exact:true}).click()
 const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Model, speed & thinking',exact:true})}).last()
 await section.getByLabel('Agent model',{exact:true}).selectOption('a');await section.getByLabel('Agent thinking',{exact:true}).selectOption('high');await section.getByLabel('Agent speed',{exact:true}).selectOption('fast');await section.getByRole('button',{name:'Save model settings'}).click();await page.waitForFunction(()=>window.savedModel?.effort==='high');assert.deepEqual(await page.evaluate(()=>window.savedModel),{model:'a',effort:'high',serviceTier:'fast'})
 await page.getByRole('dialog').getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Chat',exact:true}).click();await page.getByRole('button',{name:'Chat settings',exact:true}).click();await page.getByRole('button',{name:'Choose model and thinking'}).click();await page.getByRole('button',{name:'Model B',exact:true}).click();await page.getByRole('button',{name:'✓ Model B',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.modelCalls)).at(-1).operation,'choose')
 console.log('Phone UI: Agent choices saved as model/thinking/speed; Chat options use native provider menu and reflect choice. Fixture only.')
}finally{await browser.close()}
