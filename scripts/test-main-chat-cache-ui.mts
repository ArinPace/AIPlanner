import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}})
 await page.addInitScript({content:`globalThis.__name=(fn)=>fn;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  const id='11111111-1111-4111-8111-111111111111',chat={id,title:'Main Chat',is_main:true,pinned:true,updated_at:new Date().toISOString()},jobs=Array.from({length:8},(_,i)=>({id:'job-'+i,chat_id:id,kind:'chat',status:'completed',message:'Question '+i,reply:'Recent main reply '+i,error:null,created_at:new Date(2026,0,i+1).toISOString(),result:{}}))
  const original=window.fetch;window.fetch=async(input:any,options:any={})=>{const u=new URL(typeof input==='string'?input:input.url,location.href)
   if(u.pathname==='/api/agent/vm/main'){if(sessionStorage.getItem('hold-main'))return new Promise(()=>{});await new Promise(r=>setTimeout(r,50));return Response.json({chat,jobs,hasMore:true})}
   if(u.pathname==='/api/agent/vm')return new Promise(()=>{}) // VM/Google/settings may be arbitrarily slow.
   if(u.pathname==='/api/agent/vm/messages')return Response.json({chat,jobs:[{...jobs[0],id:'older',reply:'Older main reply',created_at:'2025-12-31T00:00:00Z'}],hasMore:false})
   return original(input,options)
  }
 })
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Agent',exact:true}).click();await page.getByText('Recent main reply 7',{exact:true}).waitFor();assert.equal(await page.locator('.assistant-turn').count(),8);assert.equal(await page.getByRole('button',{name:'Branch chat',exact:true}).count(),0)
 await page.getByRole('button',{name:'Load earlier messages',exact:true}).click();await page.getByText('Older main reply',{exact:true}).waitFor();assert.equal(await page.locator('.assistant-turn').count(),9)
 await page.waitForTimeout(150);await page.evaluate(()=>sessionStorage.setItem('hold-main','true'));await page.reload();await page.getByRole('button',{name:'Agent',exact:true}).click();await page.getByText('Recent main reply 7',{exact:true}).waitFor();assert.equal(await page.locator('.assistant-turn').count(),8)
 const isolated=await page.evaluate(async()=>{const cache=await import('/src/lib/chatCache.ts'),api=await import('/src/lib/api.ts');const other=await cache.readChatCache('another-user','agent-main');api.setToken(null);return {other,after:await cache.readChatCache('planner_test','agent-main')}});assert.equal(isolated.other,null);assert.equal(isolated.after,null)
 console.log('Main opens while VM metadata is held; eight recent turns, older pagination, disk-cache reload, no branching, account isolation and logout clearing verified.')
}finally{await browser.close()}
