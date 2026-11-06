import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 for(const width of [390,1200]){
 const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(10000)
 await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;globalThis.__plannerFixtureTutor=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{const prior=window.fetch;window.fetch=async(input,options)=>{const response=await prior(input,options);if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/subscription-chat'&&(!options?.method||options.method==='GET')){const value=await response.json();value.chats.push({id:'qa-tutor',title:'Statistics for Business Control, Regression, & Forecasting Models',tutor_subject_id:'subject-qa',pinned:true,archived:false,deleted_at:null});return Response.json(value)}return response}})
 await page.goto('http://127.0.0.1:5174')
 const styles=async(root)=>root.locator('.assistant-tutor-heading > button').first().evaluate(node=>{const s=getComputedStyle(node);return {align:s.textAlign,background:s.backgroundColor,whiteSpace:s.whiteSpace,font:s.fontSize,border:s.borderRadius}})
 await page.getByRole('button',{name:'Agent',exact:true}).click()
 const agent=page.locator('main.assistant-app').filter({visible:true})
 if(!await agent.getByRole('button',{name:'Tutor',exact:true}).isVisible())await agent.getByRole('button',{name:'Show chat sidebar',exact:true}).click()
 await agent.getByRole('button',{name:'Tutor',exact:true}).waitFor()
 const agentStyles=await styles(agent)
 await page.getByRole('button',{name:'Chat',exact:true}).click()
 const chat=page.getByRole('main',{name:'Subscription Chat'})
 if(!await chat.getByRole('button',{name:'Tutor',exact:true}).isVisible())await chat.getByRole('button',{name:'Show chat sidebar',exact:true}).click()
 const tutor=chat.getByRole('button',{name:'Tutor',exact:true})
 assert.equal(await tutor.getAttribute('aria-expanded'),'false')
 assert.deepEqual(await styles(chat),agentStyles)
 await tutor.click()
 const subjects=chat.getByRole('group',{name:'Tutor subjects'})
 const row=subjects.locator('.assistant-chat-row')
 assert.equal(await row.count(),1)
 assert.equal(await row.evaluate(node=>node.classList.contains('assistant-tutor-subjects')),false)
 const layout=await row.locator(':scope > button').evaluate(node=>{const s=getComputedStyle(node);return {height:node.getBoundingClientRect().height,align:s.textAlign,whiteSpace:s.whiteSpace,overflow:s.textOverflow}})
 assert.equal(layout.align,'left');assert.equal(layout.whiteSpace,'nowrap');assert.equal(layout.overflow,'ellipsis');assert(layout.height<=45)
 assert.equal(await chat.locator('nav.assistant-conversations').count(),1)
 await page.screenshot({path:`/tmp/planner-chat-sidebar-${width}.png`})
 await page.close()
 }
 console.log('PASS: Agent/Chat Tutor styles match at mobile/desktop sizes; collapsed default, single-line subject rows, correct shared scroll container.')
}finally{await browser.close()}
