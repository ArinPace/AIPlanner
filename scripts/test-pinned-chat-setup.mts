import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {planChatMirror} from '../src/lib/chatSync.js'
const stamp=()=>new Date().toISOString()
const base={archived:false,deleted_at:null,pinned:true,provider_url:null,provider_snapshot:null,created_at:stamp(),updated_at:stamp()}
const main:any={...base,id:'00000000-0000-4000-8000-000000000101',title:'Main Chat',is_main:true}
const tutor:any={...base,id:'00000000-0000-4000-8000-000000000102',title:'Biology',tutor_subject_id:'biology',is_main:false}
const rows=[main,tutor],remote=new Map<string,any>();let sends=0,finds=0,pending:any=null
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:393,height:852}})
 await page.exposeFunction('pinnedApi',async(input:any)=>{
  const row=rows.find(c=>c.id===input.chatId)
  if(input.action==='tool_begin'||input.action==='tool_finish')return {}
  if(input.action==='relay_bind'){assert(!row.provider_url||row.provider_url===input.url);row.provider_url=input.url;return {ok:true}}
  if(input.action==='relay_mirror'){const plan=planChatMirror({title:row.title,archived:false,deleted:false},input.observed,row.provider_snapshot);if(!input.applied)return {plan};row.provider_snapshot=input.applied;return row}
  return {chat:rows.find(c=>c.id===input.chat)||main,chats:rows,messages:[],hasOlder:false,sources:[],connection:{connected:false},google:{accounts:[]}}
 })
 await page.exposeFunction('pinnedNative',async(input:any)=>{
  if(input.action==='chatGPTRelayFind'){finds++;const url=input.title==='Biology'?'https://chatgpt.com/g/test/c/existing-biology':null;if(url)remote.set(url,{title:'Auto Biology',archived:false,deleted:false});return {url}}
  if(input.action==='chatGPTRelaySend'){sends++;assert(input.text.startsWith('Reply only READY.'));pending={url:'https://chatgpt.com/g/test/c/main-seeded'};remote.set(pending.url,{title:'Auto Main',archived:false,deleted:false});return {ok:true}}
  if(input.action==='chatGPTRelayStatus'){if(!input.peek&&pending){const result={ready:true,phase:'completed',url:pending.url};pending=null;return result}return {ready:true,phase:pending?'working':'idle'}}
  if(input.action==='chatGPTRelayMirror'){const value=remote.get(input.url);assert(value);if(input.patch)Object.assign(value,input.patch);return {...value}}
  return {ok:true}
 })
 await page.addInitScript({content:`globalThis.__name=(f)=>f;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync('ios/AIPlanner/UITestFixture.js','utf8')}`})
 await page.addInitScript(()=>{const fallback=window.fetch;window.fetch=async(input:any,options:any={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/subscription-chat')return Response.json(await (window as any).pinnedApi(options.body?JSON.parse(options.body):{chat:url.searchParams.get('chat')}));return fallback(input,options)};Object.assign(window,{plannerNativeChatGPTPortal:true,plannerNativeChatGPTRelayVersion:8});(window as any).webkit={messageHandlers:{plannerNative:{postMessage:(input:any)=>(window as any).pinnedNative(input)}}}})
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Chat',exact:true}).click();await page.getByText('Main Chat and Tutor chats are synced in Test.',{exact:true}).waitFor({timeout:20000})
 assert.equal(sends,1);assert.equal(finds,2);assert.equal(remote.get(main.provider_url).title,'Main Chat');assert.equal(remote.get(tutor.provider_url).title,'Biology');assert.equal(tutor.provider_url,'https://chatgpt.com/g/test/c/existing-biology')
 const show=page.getByRole('button',{name:'Show chat sidebar'});if(await show.isVisible())await show.click();await page.getByRole('button',{name:'Sync ChatGPT chats'}).click();await page.getByText('ChatGPT conversations synced.',{exact:true}).waitFor();assert.equal(sends,1);assert.equal(finds,2)
 console.log('Pinned setup fixture: initializes missing Main once, reuses existing Test Tutor, mirrors both names, and repeat sync creates no duplicates.')
}finally{await browser.close()}
