import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext()
const now=Date.now()
let calendar={revision:1,events:[{id:'task',title:'Actual current task',description:'',start:new Date(now-60000).toISOString(),end:new Date(now+1800000).toISOString(),allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null}}],tags:[],hiddenTagIds:[],zoom:1}
const files={revision:1,folders:[],documents:[{id:'pdf',kind:'pdf',name:'Reference.pdf',folderId:null,updatedAt:new Date().toISOString()}],files:[{id:'todo',name:'To do',systemRole:'todo',format:'note',folderId:null,content:'Private saved writing',updatedAt:new Date().toISOString()}]}
let offline=false
await context.addInitScript(()=>{window.nativeCalls=[];window.webkit={messageHandlers:{plannerNative:{postMessage:async message=>{window.nativeCalls.push(message);if(message.action==='widgetStatus')return {available:true,generatedAt:Date.now()/1000,validUntil:Date.now()/1000+86400,eventCount:1,currentTask:'Actual current task'};return {ok:true}}}}}})
await context.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname
 if(offline&&path==='/api/calendar')return route.abort()
 let data={}
 if(path==='/api/session')data={username:'alpha'}
 if(path==='/api/calendar')data=calendar
 if(path==='/api/files')data=files
 if(path==='/api/files/bin')data={items:[]}
 if(path==='/api/agent/vm')data={hosts:[],chats:[],runs:[],settings:{sources:[],sites:{},schedule:{times:[]}},google:{accounts:[]},accounts:[],queue:{queuedIds:[]},planning:{}}
 await route.fulfill({json:data})
})
const page=await context.newPage()
const copy=()=>page.evaluate(async()=>{const module=window.testReplica;return module.readReplica()})
try{
 await page.goto('http://127.0.0.1:5174')
 await page.getByRole('button',{name:'Calendar',exact:true}).waitFor()
 await page.evaluate(async()=>{const url=name=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===name).name;window.testApi=await import(url('/src/lib/api.ts'));window.testReplica=await import(url('/src/lib/localReplica.ts'))})
 await page.evaluate(async()=>{const api=window.testApi;await Promise.all([api.loadCalendar({adopt:false}),api.loadFiles()])})
 let saved=await copy()
 assert.equal(saved.account,'alpha');assert.equal(saved.parts.length,2)
 assert.equal(saved.parts.find(p=>p.kind==='files').data.files[0].content,'Private saved writing')
 const calls=await page.evaluate(()=>window.nativeCalls)
 assert(calls.some(c=>c.action==='localReplica'&&c.kind==='files'))
 assert(calls.some(c=>c.action==='widgetSchedule'&&c.schedule.events.some(e=>e.title==='Actual current task')))
 assert(!JSON.stringify(saved).includes('Authorization'))
 calendar={...calendar,revision:2,events:calendar.events.map(e=>({...e,title:'Updated task'}))}
 await page.evaluate(async()=>{await (window.testApi).loadCalendar({adopt:false})})
 assert.equal((await copy()).parts.find(p=>p.kind==='calendar').data.revision,2)
 await page.evaluate(async()=>{const m=window.testReplica;await m.saveReplica('calendar',{revision:1,events:[],tags:[],hiddenTagIds:[]})})
 assert.equal((await copy()).parts.find(p=>p.kind==='calendar').data.revision,2)
 offline=true
 await page.evaluate(async()=>{try{await (window.testApi).loadCalendar()}catch{}})
 assert.equal((await copy()).parts.find(p=>p.kind==='calendar').data.revision,2)
 await page.evaluate(async()=>{const m=window.testReplica;const old=m.replicaContext();m.activateReplica('beta');await m.saveReplica('files',{files:[{content:'stale private data'}],folders:[]},old)})
 assert.equal((await copy()).parts.length,0)
 await page.evaluate(async()=>{const m=window.testReplica;await m.saveReplica('files',{files:[],folders:[],revision:1});m.activateReplica(null)})
 saved=await copy();assert.equal(saved.account,null);assert.equal(saved.parts.length,0)
 console.log('PASS local calendar/files copies, native publishing, latest revisions, network failure preservation, account switching and sign-out cleanup.')
}finally{await browser.close()}
