import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const script=swift.split('// BEGIN_CHAT_MIRROR_SCRIPT')[1].split('#"""\n')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 const observer=swift.split('// BEGIN_CHAT_DELETION_OBSERVER')[1].split('#"""\n')[1].split('"""#')[0]
 await page.addInitScript({content:observer})
 await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<title>Planner QA</title><header><button aria-label="Chat actions" aria-haspopup="menu">Options</button></header><main></main><script>
 window.state={title:'Planner QA',archived:false,deleted:false};window.mutations=[];
 const close=()=>document.querySelectorAll('[role=menu],[role=dialog]').forEach(n=>n.remove());
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 document.querySelector('header button').addEventListener('pointerdown',()=>{close();const menu=document.createElement('div');menu.role='menu';for(const label of ['Rename',state.archived?'Unarchive':'Archive','Delete']){const n=document.createElement('div');n.role='menuitem';n.textContent=label;n.onclick=()=>{close();if(label==='Rename'){const d=document.createElement('div');d.role='dialog';d.innerHTML='<input type="text"><button>Save</button>';d.querySelector('input').value=state.title;d.querySelector('button').onclick=()=>{state.title=d.querySelector('input').value;document.title=state.title;mutations.push('rename');close()};document.body.append(d)}else if(label==='Delete'){const d=document.createElement('div');d.role='dialog';d.innerHTML='Delete '+state.title+'?<button>Delete</button>';d.querySelector('button').onclick=()=>{state.deleted=true;mutations.push('delete');close();history.replaceState(null,'','/');const status=document.createElement('div');status.role='status';status.textContent='Chat deleted';document.body.append(status)};document.body.append(d)}else{state.archived=label==='Archive';mutations.push(label.toLowerCase())}};menu.append(n)}document.body.append(menu)});
 </script>`}))
 const url='https://chatgpt.com/c/planner-qa'
 await page.goto(url)
 const run=(operation,extra={})=>page.evaluate(async({script,url,operation,...args})=>{const execute=new Function('url','operation','expected','title',`return (async()=>{${script}})()`);return execute(url,operation,args.expected??null,args.title??'')},{script,url,operation,...extra})
 assert.deepEqual(await run('read'),{title:'Planner QA',archived:false,deleted:false})
 await run('rename',{title:'Math',expected:{title:'Planner QA',archived:false,deleted:false}})
 assert.equal((await run('read')).title,'Math')
 await run('archive',{expected:{title:'Math',archived:false,deleted:false}})
 assert.equal((await run('read')).archived,true)
 await run('unarchive',{expected:{title:'Math',archived:true,deleted:false}})
 assert.equal((await run('read')).archived,false)
 await assert.rejects(()=>run('rename',{title:'Wrong',expected:{title:'Stale',archived:false,deleted:false}}),/changed while syncing/)
 assert.deepEqual(await page.evaluate(()=>mutations),['rename','archive','unarchive'])
 await run('delete',{expected:{title:'Math',archived:false,deleted:false}})
 assert.equal(await page.evaluate(()=>state.deleted),true)
 await page.waitForFunction(()=>window.__plannerMirrorDeleted['/c/planner-qa']?.deleted===true)
 await assert.rejects(()=>run('read'),/conversation changed/)
 await page.goto(url);await page.evaluate(()=>{const b=document.createElement('button');b.textContent='Log in';document.body.append(b)})
 await assert.rejects(()=>run('rename',{title:'Denied'}),/Sign in to ChatGPT/)
 assert.deepEqual(await page.evaluate(()=>mutations),[])
 await page.goto(url);await page.evaluate(()=>history.replaceState(null,'','/'));assert.deepEqual(await page.evaluate(()=>window.__plannerMirrorDeleted),{});await page.goto(url);await page.locator('header').evaluate(n=>n.remove())
 await assert.rejects(()=>run('delete'),/controls were not recognized/)
 assert.equal(await page.evaluate(()=>state.deleted),false)
 console.log('Exact native mirror script: rename/archive/unarchive/delete, stale-write refusal, signed-out gating and missing-control safety passed against DOM fixtures. Not a live ChatGPT acceptance test.')
}finally{await browser.close()}
