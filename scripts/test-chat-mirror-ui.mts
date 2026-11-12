import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {planChatMirror} from '../src/lib/chatSync.js'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const stamp=()=>new Date().toISOString()
const main:any={id:'00000000-0000-4000-8000-000000000101',title:'Mirror QA',is_main:false,pinned:false,archived:false,deleted_at:null,created_at:stamp(),updated_at:stamp(),provider_url:'https://chatgpt.com/c/planner-ui-fixture',provider_snapshot:{title:'Mirror QA',archived:false,deleted:false}}
const chats=[main]
try{
 const page=await browser.newPage({viewport:{width:1000,height:850}})
 await page.exposeFunction('mirrorFixtureApi',async(input:any)=>{
  if(input?.action==='update'){const row=chats.find(c=>c.id===input.id);Object.assign(row,input);if('deleted'in input)row.deleted_at=input.deleted?stamp():null;row.updated_at=stamp();return row}
  if(input?.action==='create'){const row={id:crypto.randomUUID(),title:'New chat',is_main:false,pinned:false,archived:false,deleted_at:null,created_at:stamp(),updated_at:stamp(),provider_url:null};chats.push(row);return row}
  if(input?.action==='relay_mirror'){
   const row=chats.find(c=>c.id===input.chatId),local={title:row.title,archived:row.archived,deleted:Boolean(row.deleted_at)},plan=planChatMirror(local,input.observed,row.provider_snapshot,input.prefer)
   assert.equal(input.url,row.provider_url)
   if(!input.applied)return {plan}
   assert.deepEqual(input.applied,{...input.observed,...plan.push})
   Object.assign(row,{title:input.applied.title,archived:input.applied.archived,deleted_at:input.applied.deleted?stamp():null,provider_snapshot:input.applied,updated_at:stamp()});return row
  }
  return {chat:chats.find(c=>c.id===input?.chat)||main,chats,messages:[],hasOlder:false,sources:[],google:{accounts:[],connected:false,activeAccountId:null},connection:{connected:false,state:'setup_required',message:'Fixture'}}
 })
 await page.addInitScript({content:`globalThis.__name=(fn)=>fn;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  const fallback=window.fetch
  window.fetch=async(input:any,options:any={})=>{
   const u=new URL(typeof input==='string'?input:input.url,location.origin)
   if(u.pathname==='/api/subscription-chat'){const body=options.body?JSON.parse(options.body):{chat:u.searchParams.get('chat')};return new Response(JSON.stringify(await (window as any).mirrorFixtureApi(body)),{headers:{'Content-Type':'application/json'}})}
   return fallback(input,options)
  }
  Object.assign(window,{plannerNativeChatGPTPortal:true,plannerNativeChatGPTRelayVersion:3,mirrorRemote:{title:'Mirror QA',archived:false,deleted:false},mirrorCalls:[]})
  ;(window as any).webkit={messageHandlers:{plannerNative:{postMessage:async(input:any)=>{
   if(input.action==='chatGPTRelayStatus')return {ready:true,needsLogin:false,phase:'idle'}
   if(input.action==='chatGPTRelayMirror'){(window as any).mirrorCalls.push(input);const current=(window as any).mirrorRemote;if(input.patch)Object.assign(current,input.patch);return {...current}}
   return {ok:true}
  }}}}
 })
 page.on('pageerror',e=>console.log('Browser error:',e.message))
 page.on('dialog',dialog=>dialog.accept())
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Chat',exact:true}).click()
 const show=page.getByRole('button',{name:'Show chat sidebar'});if(await show.isVisible())await show.click()
 await page.getByLabel('Options for Mirror QA').click();await page.getByRole('button',{name:'Rename chat',exact:true}).click()
 await page.getByRole('textbox',{name:'New name'}).fill('Planner renamed')
 await page.getByRole('dialog',{name:'Rename chat'}).getByRole('button',{name:'Rename',exact:true}).click()
 await page.waitForFunction(()=>(window as any).mirrorRemote.title==='Planner renamed',{},{timeout:8000}).catch(async e=>{console.log(await page.evaluate(()=>({remote:(window as any).mirrorRemote,calls:(window as any).mirrorCalls,version:(window as any).plannerNativeChatGPTRelayVersion,alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent)})));throw e})
 assert.equal(main.provider_snapshot.title,'Planner renamed')
 // A remote-only rename pulls into Planner rather than being overwritten.
 await page.evaluate(()=>{(window as any).mirrorRemote.title='Renamed at ChatGPT'})
 await page.getByRole('button',{name:'Sync ChatGPT chats'}).click()
 await page.getByLabel('Options for Renamed at ChatGPT').waitFor()
 assert.equal(main.title,'Renamed at ChatGPT')
 // Concurrent conflicting renames require an explicit choice.
 main.title='Local competing';main.updated_at=stamp()
 await page.evaluate(()=>{(window as any).mirrorRemote.title='Remote competing'})
 await page.getByRole('button',{name:'Sync ChatGPT chats'}).click()
 await page.getByRole('dialog',{name:'Chat sync conflict'}).waitFor()
 await page.getByRole('button',{name:'Keep ChatGPT changes'}).click()
 await page.getByLabel('Options for Remote competing').waitFor()
 assert.equal(main.title,'Remote competing')
 // Remote archive and unarchive both update the list filters.
 await page.evaluate(()=>{(window as any).mirrorRemote.archived=true})
 await page.getByRole('button',{name:'Sync ChatGPT chats'}).click()
 await page.getByRole('button',{name:'Archived chats',exact:true}).click()
 await page.getByLabel('Options for Remote competing').waitFor()
 await page.getByLabel('Options for Remote competing').click();await page.getByRole('button',{name:'Restore chat',exact:true}).click()
 await page.waitForFunction(()=>(window as any).mirrorRemote.archived===false)
 assert.equal(main.archived,false)
 await page.getByRole('button',{name:'Back to chats',exact:true}).click()
 await page.getByLabel('Options for Remote competing').click();await page.getByRole('button',{name:'Move to bin',exact:true}).click()
 await page.waitForFunction(()=>(window as any).mirrorRemote.deleted===true)
 assert(main.deleted_at)
 await page.getByRole('button',{name:'Bin',exact:true}).click();await page.getByLabel('Options for Remote competing').waitFor()
 console.log('Planner UI mirror fixture passed: local rename → native, remote rename/archive → Planner, unarchive/delete → native and Bin. Real ChatGPT account not used.')
}finally{await browser.close()}
