import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}})
 await page.addInitScript({content:`globalThis.__name=(fn)=>fn;globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`})
 await page.addInitScript(()=>{
  const stamp=new Date().toISOString(),main={id:'11111111-1111-4111-8111-111111111111',title:'Main Chat',is_main:true,pinned:true,archived:false,deleted_at:null,updated_at:stamp},subject={...main,id:'22222222-2222-4222-8222-222222222222',is_main:false,title:'Physics Tutor',tutor_subject_id:'physics'}
  let claims=0,finish:any=null,delivered=false,polls=0
  Object.assign(window,{plannerNativeChatGPTPortal:true,plannerNativeChatGPTRelayVersion:6,webkit:{messageHandlers:{plannerNative:{postMessage:async(message:any)=>message.action==='chatGPTRelayStatus'?{ready:true,needsLogin:false}:{ok:true}}}},parityFixture:{get claims(){return claims},get finish(){return finish}}})
  const original=window.fetch
  window.fetch=async(input:any,options:any={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href),data=options.body?JSON.parse(options.body):{}
   if(url.pathname==='/api/subscription-chat'){
    if(data.action==='schedule_read')return Response.json({agentHidden:true,enabled:false,schedule:{times:['07:00','17:00'],timezone:'America/New_York'},updatedAt:stamp})
    if(data.action==='schedule_claim'){claims++;return Response.json({due:false})}
    if(data.action==='tutor_sync')return Response.json({count:1})
    return Response.json({chat:main,chats:[main,subject],messages:[],hasOlder:false,sources:[],google:{accounts:[],connected:false}})
   }
   if(url.pathname==='/api/device/commands'){
    if(data.action==='finish'){finish=data;return Response.json({saved:true})}
    if(delivered||++polls===1)return Response.json({command:null});delivered=true
    return Response.json({command:{id:'33333333-3333-4333-8333-333333333333',created_at:stamp,command:{action:'ui_read'}}})
   }
   return original(input,options)
  }
 })
 await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Calendar',exact:true}).waitFor()
 await page.waitForFunction(()=>!document.querySelector('.workspace-tabs button[hidden="false"]')&&Array.from(document.querySelectorAll('.workspace-tabs button')).some(b=>b.textContent==='Agent'&&(b as HTMLElement).hidden))
 assert.equal(await page.getByRole('button',{name:'Agent',exact:true}).count(),0)
 await page.getByRole('button',{name:'Chat',exact:true}).click()
 const folder=page.getByRole('region',{name:'Tutor folder'}),toggle=folder.getByRole('button',{name:'Tutor',exact:false}).first()
 await folder.waitFor();assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('button',{name:'Physics Tutor',exact:false}).count(),0)
 await toggle.click();await page.getByRole('button',{name:'Physics Tutor',exact:false}).waitFor()
 await page.getByRole('button',{name:'Chat settings',exact:true}).click()
 assert.equal(await page.getByRole('checkbox',{name:'My sign-ins are ready; enable Chat scheduled reviews'}).isChecked(),false)
 await page.waitForFunction(()=>(window as any).parityFixture.finish!==null)
 const result=await page.evaluate(()=>({claims:(window as any).parityFixture.claims,finish:(window as any).parityFixture.finish}))
 assert.equal(result.claims,0);assert.equal(result.finish.ok,true);assert.equal(result.finish.result.executed,true)
 console.log('Chat Tutor defaults collapsed; test account hides Agent; schedule stays paused; shared device queue acknowledges actual UI command.')
}finally{await browser.close()}
