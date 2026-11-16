import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {availability,checkAlbertWatch} from './albert-monitor.mjs'
const config={steps:[],rowSelector:'#course',statusSelector:'.status',identityText:'Class 12345',openValues:['Open','Available'],closedValues:['Closed','Waitlist','Wait List','Full']}
test('only exact unambiguous availability states count as open',()=>{
 assert.equal(availability(' Open ',config),'open');assert.equal(availability('Wait List',config),'closed')
 for(const text of ['not open','Open seats: 0','Loading','login','Open Closed',''])assert.equal(availability(text,config),'unknown')
 assert.equal(availability('Open',{...config,closedValues:['Open']}),'unknown')
})
test('Albert checks read the verified class, reject enrollment and never infer from missing identity',async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLANNER_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 const context=await browser.newContext();let status='Open',identity='Class 12345',image=false
 await context.route('https://albert.nyu.edu/fixture',route=>route.fulfill({contentType:'text/html',body:`<div id=course><strong>${identity}</strong> <span class=status>${image?'<img alt="Open" src="data:,">':status}</span></div><button id=enroll onclick="window.wasEnrolled=true">Enroll</button>`}))
 const watch={url:'https://albert.nyu.edu/fixture',config}
 try{
  assert.equal((await checkAlbertWatch(context,watch)).status,'open')
  status='Closed';assert.equal((await checkAlbertWatch(context,watch)).status,'closed')
  status='not open';assert.equal((await checkAlbertWatch(context,watch)).status,'unknown')
  image=true;assert.equal((await checkAlbertWatch(context,watch)).status,'open')
  identity='Class 123456';assert.equal((await checkAlbertWatch(context,watch)).status,'unknown')
  identity='Class 54321';assert.equal((await checkAlbertWatch(context,watch)).status,'unknown')
  const denied=await checkAlbertWatch(context,{...watch,config:{...config,steps:[{action:'click',selector:'#enroll'}]}});assert.equal(denied.status,'unknown');assert.match(denied.detail,/read-only/)
  assert.equal(context.pages().length,0,'Polling closes only its own temporary page')
 }finally{await browser.close()}
})
