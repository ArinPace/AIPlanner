import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const origin=process.env.PLANNER_TEST_URL||'http://127.0.0.1:5173'
const fixture=fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')
const previewName='.flow-wave-test-'+process.pid+'.html',previewPath=new URL('../'+previewName,import.meta.url)
fs.writeFileSync(previewPath,`<!doctype html><html><body><div id="wave-test" style="width:280px;height:280px;margin:24px"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {FlowFibres} from '/src/components/FlowFibres.tsx';import '/src/index.css';
const root=createRoot(document.getElementById('wave-test'));root.render(React.createElement(FlowFibres));window.unmountWave=()=>root.unmount();
</script></body></html>`,{flag:'wx'})
async function mount(page){await page.goto(origin+'/'+previewName);await page.waitForSelector('#wave-test canvas')}

try{
 const page=await browser.newPage({viewport:{width:390,height:500},deviceScaleFactor:2})
 let workers=0;page.on('worker',()=>workers++)
 await page.addInitScript(()=>{window.mainDraws=0;const draw=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){window.mainDraws++;return draw.apply(this,args)}})
 await mount(page);await page.waitForSelector('#wave-test canvas[data-ready=true]');assert(workers>0,'Rendering uses a worker');assert.equal(await page.evaluate(()=>window.mainDraws),0,'Animation does not draw on the main UI thread')
 const phases=await page.evaluate(async()=>{
  const {loadWave,drawWave,waveState}=await import('/src/lib/flowWaveRenderer.ts'),strands=await loadWave(),canvas=document.createElement('canvas');canvas.width=canvas.height=280;const ctx=canvas.getContext('2d',{willReadFrequently:true})
  const sample=t=>{drawWave(ctx,strands,t,280,280);return Array.from(ctx.getImageData(0,0,280,280).data)}
  const calm=sample(4),later=sample(6),oppositeCalm=sample(12),start=sample(0),loop=sample(16)
  return {strands:strands.length,vertices:strands.reduce((n,s)=>n+s.tones.length,0),calmEqual:calm.every((n,i)=>n===later[i]&&n===oppositeCalm[i]),seamMean:start.reduce((n,v,i)=>n+Math.abs(v-loop[i]),0)/start.length,directions:[waveState(0).direction,waveState(8).direction],phases:[0,2,4,7].map(t=>waveState(t).phase)}
 })
 assert(phases.strands<=900&&phases.vertices<22000);assert(phases.calmEqual,'Ocean is truly still between waves');assert(phases.seamMean<.1,'Sixteen-second loop is seamless');assert.deepEqual(phases.directions,[1,-1]);assert.deepEqual(phases.phases,['wave','crash','ocean','rise']);await page.close()
 const fallback=await browser.newPage();await fallback.addInitScript(()=>Object.defineProperty(HTMLCanvasElement.prototype,'transferControlToOffscreen',{value:undefined}));await mount(fallback);await fallback.waitForSelector('#wave-test canvas[data-ready=true]');await fallback.close()
 const reduced=await browser.newPage();await reduced.emulateMedia({reducedMotion:'reduce'});let geometryRequests=0;reduced.on('request',r=>{const u=new URL(r.url());if(u.pathname.endsWith('flow-wave.bin')&&!u.search)geometryRequests++});await mount(reduced);await reduced.waitForTimeout(500);assert.equal(geometryRequests,0,'Reduced motion never downloads strand geometry');await reduced.close()
 const fast=await browser.newPage();let fastWorkers=0;fast.on('worker',()=>fastWorkers++);await mount(fast);await fast.waitForSelector('#wave-test canvas');await fast.evaluate(()=>window.unmountWave());await fast.waitForTimeout(350);assert.equal(fastWorkers,0,'Short loading screens never initialize the animator');await fast.close()
 const app=await browser.newPage(),pending=[]
 await app.addInitScript({content:'globalThis.__plannerFixtureSignedIn=true;'+fixture})
 await app.addInitScript(()=>{const send=window.fetch;window.fetch=async(input,options)=>{if(new URL(typeof input==='string'?input:input.url,location.origin).pathname==='/api/calendar'&&(!options?.method||options.method==='GET')){await new Promise(r=>setTimeout(r,650));window.calendarResolved=performance.now()}return send(input,options)};new MutationObserver(()=>{if(!window.calendarShown&&document.querySelector('.app-header'))window.calendarShown=performance.now()}).observe(document,{childList:true,subtree:true})})
 await app.route('**/src/assets/flow-wave.bin',route=>pending.push(route));await app.goto(origin);await app.locator('.app-header').waitFor();const timing=await app.evaluate(()=>({shown:window.calendarShown,resolved:window.calendarResolved}));assert(pending.length>0,'Geometry was stalled during loading');assert(timing.shown-timing.resolved<300,'Calendar appears immediately when data resolves, despite stalled animation download');for(const route of pending)await route.abort().catch(()=>{});await app.close()
 console.log(JSON.stringify({passed:'Worker rendering, lightweight fallback, still ocean, opposite directions, seamless loop, reduced-motion and short-load skipping, nonblocking calendar readiness',phases,dataToCalendarMs:timing.shown-timing.resolved}))
}finally{await browser.close();fs.unlinkSync(previewPath)}
