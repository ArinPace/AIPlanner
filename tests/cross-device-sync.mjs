// Two isolated sessions share a revision-checked fixture backend, not user data.
import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const stamp=new Date().toISOString()
let calendar={revision:1,events:[],tags:[],hiddenTagIds:[],zoom:1}
let files={revision:1,folders:[],documents:[],files:[{id:'todo',name:'To do',systemRole:'todo',format:'note',folderId:null,content:'Initial shared to do',updatedAt:stamp},{id:'work',name:'Work',format:'note',folderId:null,content:'Initial shared work',updatedAt:stamp}]}
const until=async(check)=>{const end=Date.now()+6000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw Error('Shared state did not converge')}
async function session(phone){
 const context=await browser.newContext({viewport:phone?{width:393,height:852}:{width:1280,height:900}})
 if(phone)await context.addInitScript(()=>{window.webkit={messageHandlers:{plannerNative:{postMessage:async()=>({ok:true})}}}})
 await context.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let value={},status=200
  if(path==='/api/session')value={username:'arin'}
  if(path==='/api/calendar'||path==='/api/files'){
   const previous=path==='/api/calendar'?calendar:files
   if(request.method()==='PUT'){
    const input=request.postDataJSON()
    if(input.revision!==previous.revision){status=409;value={error:'Shared version changed; reload before saving.'}}
    else{const next={...input,revision:previous.revision+1};if(path==='/api/calendar')calendar=next;else files=next;value={ok:true,revision:next.revision}}
   }else value=previous
  }
  if(path==='/api/calendar/google-sync')value={connected:true,pending:true,reviewRequired:true,error:null}
  if(path==='/api/files/bin')value={items:[]}
  if(path==='/api/agent/vm')value={hosts:[],chats:[],runs:[],settings:{sources:[],sites:{},schedule:{times:[]}},google:{accounts:[]},accounts:[],queue:{queuedIds:[]},planning:{}}
  await route.fulfill({status,json:value})
 })
 const page=await context.newPage();page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Calendar',exact:true}).waitFor();return {page,context}
}
const refresh=page=>page.evaluate(()=>window.dispatchEvent(new Event('focus')))
const month=page=>page.getByRole('tab',{name:'Month',exact:true}).click()
async function create(page,title){await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByPlaceholder('Add title').fill(title);await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await until(()=>calendar.events.some(e=>e.title===title))}
try{
 const web=await session(false),phone=await session(true)
 assert.equal(await phone.page.getByRole('button',{name:'Chat',exact:true}).count(),0)
 await create(web.page,'Saved on website');await month(phone.page);await refresh(phone.page)
 await phone.page.getByText('Saved on website',{exact:true}).first().waitFor()
 await create(phone.page,'Saved on iPhone');await month(web.page);await refresh(web.page)
 await web.page.getByText('Saved on iPhone',{exact:true}).first().waitFor()
 await web.page.getByRole('button',{name:'To-do',exact:true}).click()
 await web.page.getByRole('textbox',{name:'Note content',exact:true}).fill('To do saved from website')
 await until(()=>files.files.find(f=>f.id==='todo').content.includes('To do saved from website'))
 await phone.page.getByRole('button',{name:'To-do',exact:true}).click();await refresh(phone.page)
 await until(async()=> (await phone.page.getByRole('textbox',{name:'Note content',exact:true}).innerText()).includes('To do saved from website'))
 await phone.page.getByRole('button',{name:'Work',exact:true}).click()
 await phone.page.getByRole('textbox',{name:'Note content',exact:true}).fill('Work saved from iPhone')
 await until(()=>files.files.find(f=>f.id==='work').content.includes('Work saved from iPhone'))
 await web.page.getByRole('button',{name:'Work',exact:true}).click();await refresh(web.page)
 await until(async()=> (await web.page.getByRole('textbox',{name:'Note content',exact:true}).innerText()).includes('Work saved from iPhone'))
 await phone.page.getByRole('textbox',{name:'Note content',exact:true}).fill('Unsaved local phone edit')
 files={...files,revision:files.revision+1,files:files.files.map(f=>f.id==='work'?{...f,content:'New external version'}:f)}
 await refresh(phone.page)
 assert((await phone.page.getByRole('textbox',{name:'Note content',exact:true}).innerText()).includes('Unsaved local phone edit'))
 console.log('PASS website ↔ iPhone calendar, To-do/Work synchronization; active unsaved edits preserved; Chat omitted.')
}finally{await browser.close()}
