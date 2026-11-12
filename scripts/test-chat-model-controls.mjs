import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const script=swift.split('// BEGIN_CHAT_MODEL_MENU')[1].split('#"""')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:`<button id="model" aria-label="Select ChatGPT model">Model A</button><script>
 window.changes=[];document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('[role=menu]')?.remove()});
 document.querySelector('#model').onclick=()=>{const m=document.createElement('div');m.role='menu';for(const label of ['Model A','Model B','Thinking','Speed','Upgrade']){const b=document.createElement('button');b.role='menuitemradio';b.textContent=label;b.setAttribute('aria-checked',document.querySelector('#model').textContent===label);b.onclick=()=>{changes.push(label);document.querySelector('#model').textContent=label;m.remove()};m.append(b)}document.body.append(m)};
 </script>`}))
 await page.goto('https://chatgpt.com/')
 const run=(operation,id=null,value=null)=>page.evaluate(async({script,operation,id,value})=>new Function('operation','id','value',`return(async()=>{${script}})()`)(operation,id,value),{script,operation,id,value})
 let menu=await run('open');assert.equal(menu.options.length,4);assert(menu.options.find(x=>x.label==='Model A').selected);assert(!menu.options.some(x=>/Upgrade/.test(x.label)))
 const old=menu.options.find(x=>x.label==='Model B').id
 await run('choose',old);assert.equal((await run('open')).summary,'Model B');assert.deepEqual(await page.evaluate(()=>changes),['Model B'])
 await assert.rejects(()=>run('choose',old),/options changed/);await page.evaluate(()=>{const m=document.querySelector('[role=menu]');const row=document.createElement('div');row.role='menuitem';row.setAttribute('aria-label','Power');row.innerHTML='<span role="slider" tabindex="0" aria-label="Power" aria-valuemin="0" aria-valuemax="5" aria-valuenow="1" aria-valuetext="Light">Thinking</span>';const slider=row.firstChild;slider.onkeydown=e=>{slider.setAttribute('aria-valuenow',Number(slider.getAttribute('aria-valuenow'))+(e.key==='ArrowRight'?1:-1))};m.append(row)})
 const menuWithSlider=await run('choose',null).catch(()=>null)
 assert.equal(menuWithSlider,null)
 await page.locator('[role=slider]').evaluate(n=>n.dataset.plannerModelOption='power-test')
 const adjusted=await run('adjust','power-test',3);assert.equal(adjusted.sliders[0].value,3);assert(!adjusted.options.some(x=>x.label==='Power'));await assert.rejects(()=>run('adjust','power-test',9),/supported thinking/)
 await run('close');assert.equal(await page.locator('[role=menu]').count(),0)
 console.log('Native public model controls: provider options, checked state, change, stale refusal, upgrade filtering and close passed. DOM fixture only.')
}finally{await browser.close()}
