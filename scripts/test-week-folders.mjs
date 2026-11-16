import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const base={description:'',allDay:false,tagIds:['class'],recurrence:{frequency:'none',interval:1,until:null},start:date+'T10:00:00-05:00',end:date+'T11:15:00-05:00'}
const events=[{...base,id:'parent',title:'Study folder',eventKind:'folder'},...Array.from({length:8},(_,i)=>({...base,id:'event-'+i,title:'Study session '+i,folderId:'parent'})),{...base,id:'nested',title:'Nested folder',eventKind:'folder',folderId:'parent'},{...base,id:'leaf',title:'Nested session',folderId:'nested'}]
const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace('revision:1,events:[]','revision:1,events:'+JSON.stringify(events))
try{for(const width of [393,1200]){
 const page=await browser.newPage({viewport:{width,height:852}});page.setDefaultTimeout(10000)
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture});await page.goto(process.env.PLANNER_TEST_URL||'http://127.0.0.1:5174');await page.locator('.app-header').waitFor()
 if(width<700)await page.getByRole('button',{name:'Toggle sidebar'}).click()
 await page.getByRole('group',{name:'Calendar view',exact:true}).getByRole('button',{name:'Week',exact:true}).click()
 const week=page.getByLabel('Week calendar',{exact:true});await week.waitFor();assert.equal(await week.locator('.week-card-day').count(),7)
 assert.equal(await week.locator('.week-event-card').count(),1)
 await week.getByRole('button',{name:'Expand folder Study folder',exact:true}).click();assert.equal(await week.locator('.week-event-card').count(),10)
 await week.getByRole('button',{name:'Expand folder Nested folder',exact:true}).click();assert.equal(await week.locator('.week-event-card').count(),11)
 assert.equal(await week.getByRole('button',{name:'Collapse folder Study folder',exact:true}).getAttribute('aria-expanded'),'true')
 const strip=week.locator('.week-event-strip').filter({has:page.getByRole('button',{name:'Collapse folder Study folder',exact:true})})
 assert(await strip.evaluate(e=>e.scrollWidth>e.clientWidth))
 const sizes=await strip.locator('.week-event-card').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));assert(sizes.every(x=>Math.abs(x-sizes[0])<1),'Expanded cards retain five-across sizing')
 await week.getByRole('button',{name:'Study session 0',exact:false}).click();await page.locator('.event-modal').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click()
 await week.getByRole('button',{name:'Collapse folder Study folder',exact:true}).click();assert.equal(await week.locator('.week-event-card').count(),1)
 const first=await week.locator('[data-week-day]').first().getAttribute('data-week-day');await page.getByRole('button',{name:'Next',exact:true}).click();assert.notEqual(await week.locator('[data-week-day]').first().getAttribute('data-week-day'),first)
 await page.close();console.log(width+'px: folders, nested expansion, collapse, five-card sizing, event editing and week navigation passed.')
}}finally{await browser.close()}
