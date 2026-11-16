import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const base=process.env.PLANNER_TEST_URL||'http://127.0.0.1:5174'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const page=await browser.newPage({viewport:{width:393,height:852}})
page.on('pageerror',error=>console.error('UI error:',error.message))
let status={configured:false,connected:false,needsReconnect:false,lastSyncedAt:null,lastWebhookAt:null,error:null},disconnects=0
const id='11111111-1111-4111-8111-111111111111',stamp=new Date().toISOString()
const workspace={chat:{id,title:'Main Chat',is_main:true},chats:[],attempts:[],messages:[{id:'a',role:'user',content:'Scheduled WHOOP sleep check',created_at:'2026-11-16T10:00:00Z'},{id:'b',role:'assistant',content:'WHOOP background fixture report',created_at:'2026-11-16T10:00:01Z'},{id:'c',role:'user',content:'My normal question',created_at:'2026-11-16T10:01:00Z'},{id:'d',role:'assistant',content:'My normal answer',created_at:'2026-11-16T10:01:01Z'}],hasOlder:false}
await page.route('**/whoop-ui-fixture**',route=>route.fulfill({contentType:'text/html',body:`<html><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const {WhoopConnection}=await import('/src/components/WhoopConnection.tsx');const {MainChatBubble}=await import('/src/components/MainChatBubble.tsx');
const C=location.search.includes('chat')?MainChatBubble:WhoopConnection;createRoot(document.getElementById('root')).render(React.createElement(C,{username:'fixture',open:true,onOpenChange:()=>{}}));
</script></body></html>`}))
await page.route('**/api/agent/whoop',async route=>{const method=route.request().method();if(method==='DELETE'){disconnects++;status={...status,connected:false};return route.fulfill({json:{disconnected:true}})}if(method==='POST')return route.fulfill({json:{url:'https://aiplanner-ten.vercel.app/api/whoop/authorize?ticket=fixture'}});return route.fulfill({json:status})})
await page.route('**/api/subscription-chat**',route=>route.fulfill({json:workspace}))
try{
 await page.goto(base+'/whoop-ui-fixture');await page.getByText('Developer app setup needed').waitFor()
 assert.equal(await page.getByRole('button',{name:'Connect',exact:true}).count(),0)
 await page.getByText('Set up automatic updates').click();assert(await page.getByText('https://aiplanner-ten.vercel.app/api/whoop/webhook',{exact:true}).isVisible())
 status={...status,configured:true};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'Connect',exact:true}).waitFor()
 await page.evaluate(()=>{window.__whoopOpen=null;window.webkit={messageHandlers:{plannerNative:{postMessage:async value=>{window.__whoopOpen=value;return {}}}}}})
 await page.getByRole('button',{name:'Connect',exact:true}).click();await page.waitForFunction(()=>window.__whoopOpen?.action==='openExternalLink')
 assert.equal(await page.evaluate(()=>window.__whoopOpen.url),'https://aiplanner-ten.vercel.app/api/whoop/authorize?ticket=fixture')
 status={...status,connected:true,lastSyncedAt:stamp};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('Connected · automatic updates').waitFor()
 assert(await page.getByText('Updates arrive even with Planner closed. ChatGPT relay reviews run when Planner is open.').isVisible())
 await page.getByRole('button',{name:'Disconnect WHOOP'}).click();await page.getByText('Not connected',{exact:true}).waitFor();assert.equal(disconnects,1)
 await page.evaluate(()=>{delete window.webkit});await page.goto(base+'/whoop-ui-fixture?chat');await page.getByText('My normal answer',{exact:true}).waitFor()
 assert(!await page.getByText('WHOOP background fixture report',{exact:true}).isVisible())
 await page.getByText('WHOOP background updates',{exact:true}).click();assert(await page.getByText('WHOOP background fixture report',{exact:true}).isVisible());assert(await page.getByText('My normal question',{exact:true}).isVisible())
 console.log('WHOOP setup, native OAuth handoff, focus refresh, disconnect and collapsed background history passed.')
}finally{await browser.close()}
