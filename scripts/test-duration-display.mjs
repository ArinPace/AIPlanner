import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const setup=`calendar.events=(()=>{const make=(id,title,hours,minutes,folderId,eventKind)=>{const start=new Date();start.setHours(hours,0,0,0);const end=new Date(start.getTime()+minutes*60000);return {id,title,start:start.toISOString(),end:end.toISOString(),description:'',allDay:false,tagIds:['school'],folderId,eventKind,recurrence:{frequency:'none',interval:1,until:null}}};return [make('one','One hour',9,60),make('two','Two hours',10,120),make('folder','Two-hour folder',13,120,null,'folder'),make('child-one','Folder first hour',13,60,'folder'),make('child-two','Folder second hour',14,60,'folder')]})();\n`
try{for(const width of [393,1280]){
 const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/New_York'})
 const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8').replace(' const subscriptionMessages=[];',setup+' const subscriptionMessages=[];')
 await page.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
 await page.goto('http://127.0.0.1:5174')
 const week=page.locator('.mobile-week'),one=week.locator('button[title="One hour"]'),two=week.locator('button[title="Two hours"]'),folder=week.locator('button[title="Two-hour folder"]')
 await one.waitFor();assert.equal((await one.boundingBox()).height,(await two.boundingBox()).height)
 const openSettings=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor()}
 await openSettings();await page.getByRole('switch',{name:'Scale week view to duration'}).check();await page.getByRole('button',{name:'Close settings',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('.mobile-week button[title="Two hours"]').getBoundingClientRect().height===120)
 assert.equal((await two.boundingBox()).height,2*(await one.boundingBox()).height)
 assert.equal((await folder.boundingBox()).height,120)
 await folder.click();assert.equal((await folder.boundingBox()).height,36)
 assert.equal((await week.locator('button[title="Folder first hour"]').boundingBox()).height,60)
 await page.getByRole('tab',{name:'Month',exact:true}).click();await openSettings()
 assert.equal(await page.getByRole('switch',{name:'Scale month view to duration'}).isChecked(),false)
 await page.getByRole('switch',{name:'Scale month view to duration'}).check();await page.getByRole('button',{name:'Close settings',exact:true}).click()
 const month=page.locator('.month-view');await month.locator('button[title="One hour"]').waitFor()
 assert.equal((await month.locator('button[title="Two hours"]').boundingBox()).height,2*(await month.locator('button[title="One hour"]').boundingBox()).height)
 assert.equal((await month.locator('button[title="Two-hour folder"]').boundingBox()).height,60)
 await openSettings();await page.getByRole('switch',{name:'Scale week view to duration'}).uncheck();await page.reload();await openSettings()
 assert.equal(await page.getByRole('switch',{name:'Scale week view to duration'}).isChecked(),false)
 assert.equal(await page.getByRole('switch',{name:'Scale month view to duration'}).isChecked(),true)
 await page.close();console.log(width+'px: week/month duration ratios, folder expansion, independent settings and reload passed')
}}finally{await browser.close()}
