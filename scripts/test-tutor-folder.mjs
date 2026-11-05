import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{for(const width of [393,1280]){
 const page=await browser.newPage({viewport:{width,height:852}})
 await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;globalThis.__plannerFixtureTutor=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Agent',exact:true}).click()
 const open=async()=>{const show=page.getByRole('button',{name:'Show chat sidebar'});if(await show.isVisible())await show.click()}
 await open();const folder=page.getByRole('button',{name:'Tutor',exact:true}),subjects=page.getByRole('group',{name:'Tutor subjects'})
 await subjects.waitFor();assert.equal(await subjects.getByRole('button').count(),3)
 await subjects.getByRole('button',{name:'Statistics',exact:true}).click();await page.locator('.assistant-chat-title strong').getByText('Statistics',{exact:true}).waitFor()
 await open();await folder.click();assert.equal(await subjects.count(),0);await page.reload();await page.getByRole('button',{name:'Agent',exact:true}).click();await open()
 assert.equal(await folder.getAttribute('aria-expanded'),'false');await folder.click();await subjects.waitFor()
 await subjects.getByRole('button',{name:'Computer Science',exact:true}).click();await page.locator('.assistant-chat-title strong').getByText('Computer Science',{exact:true}).waitFor()
 await open();await page.getByRole('button',{name:'Refresh Tutor subjects'}).click();await subjects.getByRole('button',{name:'Statistics',exact:true}).waitFor()
 assert.equal(await subjects.getByRole('button').count(),3)
 await page.getByRole('complementary',{name:'Chat sidebar'}).getByRole('button',{name:'Settings',exact:true}).click()
 await page.getByRole('region',{name:'Automatic subject turnover'}).getByText(/Dec 23, 2026.*9:00 AM/).waitFor()
 await page.getByRole('dialog',{name:'Settings',exact:true}).getByRole('button',{name:'Done',exact:true}).click()
 console.log(width+'px: Tutor folder, three independent subject selections, collapse persistence and refresh passed')
 await page.close()
}}finally{await browser.close()}
