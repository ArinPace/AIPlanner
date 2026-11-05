import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}})
 page.on('pageerror',e=>console.log('UI error:',e.message))
 await page.addInitScript({content:`globalThis.__name=(fn)=>fn;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  const files=Array.from({length:120},(_,i)=>({id:'cache-'+i,name:i===0?'To do':i===1?'Work':'Note '+i,folderId:null,format:'note',...(i===0?{systemRole:'todo'}:{}),content:'# '+(i===0?'To do':i===1?'Work':'Note '+i)+'\n\nCached text '+i,updatedAt:new Date().toISOString()}))
  const counts={manifest:0,batches:0,single:0,bin:0};Object.assign(window,{cacheFixture:counts})
  const original=window.fetch;window.fetch=async(input:any,options:any={})=>{const u=new URL(typeof input==='string'?input:input.url,location.href)
   if(u.pathname==='/api/files'&&u.searchParams.has('manifest')){counts.manifest++;await new Promise(r=>setTimeout(r,80));return Response.json({format:'files-manifest',revision:1,storageLimitBytes:4194304,items:files.map((f,index)=>({section:'files',id:f.id,index,etag:'e'+index,bytes:200}))})}
   if(u.pathname==='/api/files/system-note'){const role=u.searchParams.get('role');return Response.json({revision:1,partial:true,folders:[],files:[files[role==='work'?1:0]],documents:[],storageLimitBytes:4194304})}
   if(u.pathname==='/api/files/batch'){counts.batches++;if(sessionStorage.getItem('cold-canonical'))return new Promise(()=>{});await new Promise(r=>setTimeout(r,80));const data=JSON.parse(options.body);return Response.json({revision:1,items:files.filter(f=>data.ids.includes(f.id))})}
   if(u.pathname==='/api/files/item'){counts.single++;throw Error('Small notes should use bounded batches')}
   if(u.pathname==='/api/files/bin'){counts.bin++;return new Promise(()=>{})}
   return original(input,options)
  }
 })
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('heading',{name:'Files',exact:true}).waitFor()
 const initial=await page.evaluate(()=>(window as any).cacheFixture);assert.equal(initial.batches,3);assert.equal(initial.single,0);assert.equal(initial.bin,0)
 for(const tab of ['To-do','Work','Files','Calendar','Files']){await page.getByRole('button',{name:tab,exact:true}).click();if(tab==='To-do'||tab==='Work')await page.locator('.ProseMirror:visible').waitFor({timeout:6000}).catch(async e=>{console.log('Failed tab:',tab,(await page.locator('body').innerText()).slice(-1500));throw e})}
 const after=await page.evaluate(()=>(window as any).cacheFixture);assert.equal(after.manifest,1);assert.equal(after.batches,3);assert.equal(after.bin,0)
 await page.reload();await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('heading',{name:'Files',exact:true}).waitFor();await page.waitForTimeout(300)
 const warm=await page.evaluate(()=>(window as any).cacheFixture);assert.equal(warm.batches,0);assert.equal(warm.single,0)
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase('planner-local-copy');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)}));await page.evaluate(()=>sessionStorage.setItem('cold-canonical','true'));await page.reload();await page.getByRole('button',{name:'To-do',exact:true}).click();await page.locator('.ProseMirror:visible').waitFor();assert.match(await page.locator('.ProseMirror:visible').innerText(),/Cached text 0/)
 console.log('120-note cold load: 1 manifest + 3 bounded reads; tab switches: 0 extra requests; reload reuses account-local cache; Bin never blocks Files; cold To-do opens while full workspace reads are held.')
}finally{await browser.close()}
