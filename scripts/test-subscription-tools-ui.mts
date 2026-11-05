import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}})
 await page.addInitScript({content:`globalThis.__name=(fn)=>fn;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  const stamp=new Date().toISOString(),chat={id:'11111111-1111-4111-8111-111111111111',title:'Main Chat',is_main:true,pinned:true,archived:false,deleted_at:null,updated_at:stamp,provider_url:null,provider_snapshot:null}
  const messages:any[]=[],calls:any[]=[],nativeCalls:any[]=[],turns:any[]=[];let turn='',stage=0,pending=false,interact=false,portal=false
  Object.assign(window,{plannerNativeChatGPTPortal:true,plannerNativeChatGPTRelayVersion:5,toolFixture:{messages,calls,nativeCalls,turns}})
  const original=window.fetch
  window.fetch=async(input:any,options:any={})=>{
   const path=new URL(typeof input==='string'?input:input.url,location.href).pathname
   if(path==='/api/subscription-chat'){
    const b=options.body?JSON.parse(options.body):{}
    if(b.action==='tool_begin'){turn=b.turnId;turns.push(b);return Response.json({instructions:'Use Planner tools through planner-tools blocks.'})}
    if(b.action==='tool_call'){calls.push(...b.calls);return Response.json({results:b.calls.map((c:any)=>({id:c.id,result:{saved:true,note:{name:'Relay tools QA',content:'Verified'},revision:2}}))})}
    if(b.action==='tool_finish'){turns.push(b);return Response.json({finished:true})}
    if(b.action==='relay_bind'){if(!(window as any).__bindRetried){(window as any).__bindRetried=true;throw new TypeError('Network connection interrupted')}chat.provider_url=b.url;return Response.json({ok:true})}
    if(b.action==='relay_save'){messages.push({id:'u',role:'user',content:b.prompt,created_at:stamp},{id:'a',role:'assistant',content:b.reply,created_at:stamp});return Response.json({ok:true})}
    if(b.action==='relay_mirror'){if(!b.applied)return Response.json({plan:{push:{},pull:{},conflicts:[]}});return Response.json(chat)}
    return Response.json({chat,chats:[chat],messages,hasOlder:false,sources:[],google:{accounts:[],connected:false},connection:{connected:false}})
   }
   if(/^\/api\/agent\/vm\/(send|pair|activity|browser)/.test(path))throw Error('Subscription tools must not send VM jobs')
   return original(input,options)
  }
  window.webkit={messageHandlers:{plannerNative:{postMessage:async(b:any)=>{
   nativeCalls.push(b)
   if(b.action==='chatGPTRelayMirror')return {title:'Main Chat',archived:false,deleted:false}
   if(b.action==='chatGPTPortal'||b.action==='chatGPTSiteSignIn'){portal=true;return {ok:true}}
   if(b.action==='chatGPTRelaySend'){assertTurn(b.text);pending=true;return {ok:true}}
   if(b.action==='chatGPTRelayStatus'){
    if(b.peek||!pending)return {ready:true,needsLogin:false,phase:'idle'}
    if(stage===0){pending=false;stage++;return result('PLANNER_TOOL_REQUEST\n'+JSON.stringify({turn,calls:[{id:'save',name:'planner_save_note',arguments:{name:'Relay tools QA',content:'Verified'}}]})+'\nEND_PLANNER_TOOL_REQUEST')}
    if(!interact){interact=true;return {phase:'interaction',ready:true,text:'Please sign in privately.'}}
    if(!portal)return {phase:'interaction',ready:true,text:'Please sign in privately.'}
    pending=false;return result('Created the test note and read it back.')
   }
   return {ok:true}
  }}}}
  function result(text:string){return {phase:'completed',ready:true,text,url:'https://chatgpt.com/c/fixture-tools',files:[]}}
  function assertTurn(text:string){if(!text.includes(turn))throw Error('Missing response ID')}
 })
 await page.goto('http://127.0.0.1:5174')
 await page.getByRole('button',{name:'Chat',exact:true}).click()
 const chat=page.getByRole('main',{name:'Subscription Chat'})
 await chat.getByRole('textbox',{name:'Message ChatGPT'}).fill('Create a test note, then check Brightspace sign-in.')
 await chat.getByRole('button',{name:'Send message'}).click()
 await chat.getByText('Created the test note and read it back.',{exact:true}).waitFor({timeout:20000})
 const state=await page.evaluate(()=>(window as any).toolFixture)
 assert.equal(state.calls.length,1);assert.equal(state.calls[0].name,'planner_save_note')
 assert.equal(state.messages.length,2);assert.equal(state.messages[0].content,'Create a test note, then check Brightspace sign-in.')
 assert(!JSON.stringify(state.messages).includes('planner-tools'));assert(state.turns.some((t:any)=>t.action==='tool_finish'&&!t.cancelled))
 assert(state.nativeCalls.some((c:any)=>c.action==='chatGPTSiteSignIn'&&c.intent==='interaction'))
 assert(state.nativeCalls.some((c:any)=>c.action==='chatGPTRelayStatus'&&c.peek===true))
 await chat.getByRole('button',{name:'Add sites',exact:true}).first().click()
 await page.getByRole('dialog',{name:'Chat connected sites'}).getByRole('button',{name:'Connect Brightspace',exact:true}).click()
 await page.waitForFunction(()=>(window as any).toolFixture.messages.length===4)
 assert((await page.evaluate(()=>(window as any).toolFixture.messages[2].content)).includes('https://brightspace.nyu.edu'))
 console.log('Planner UI tool loop, private protocol, secure-interaction handoff, final transcript and non-consuming status checks passed against fixtures. Not a live Brightspace sign-in test.')
}finally{await browser.close()}
