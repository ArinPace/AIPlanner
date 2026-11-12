import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const snapshot=swift.split('private var snapshotScript: String { """')[1].split('""" }')[0].replaceAll('\\\\','\\')
const composer=swift.split('// BEGIN_CHAT_COMPOSER_READER')[1].split('#"""\n')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}))
 await page.goto('https://chatgpt.com/c/fixture')
 await page.setContent(`<div contenteditable="true" data-composer-markdown=""></div><article><div data-message-author-role="assistant">Files ready.
 <span role="button" data-file-reference="true" aria-label="Download unchanged.zip">Download ZIP</span>
 <a href="/backend-api/estuary/content?file=fixture">PDF</a>
 <button aria-label="Download file">PNG</button></div><button aria-label="Copy">Copy</button></article>`)
 await page.evaluate(composer)
 const result=await page.evaluate(snapshot)
 assert.equal(result.count,1);assert.equal(result.final,true);assert.equal(result.files.length,3)
 assert.equal(new Set(result.files.map(f=>f.key)).size,3)
 assert.equal(await page.locator('[data-planner-download-id]').count(),3)
 await page.evaluate(()=>{const f=document.createElement('form');f.id='secure';f.innerHTML='<h2>Sign in to brightspace.nyu.edu</h2><input type="password" value="fixture-secret-do-not-export"><button>Sign in</button><button>Take over to sign in</button>';document.body.append(f)})
 const secure=await page.evaluate(snapshot)
 assert.equal(secure.interaction,true);assert.equal(secure.guest,false);assert.equal(secure.needsLogin,false);assert(!JSON.stringify(secure).includes('fixture-secret-do-not-export'))

 await page.locator('#secure').evaluate(n=>{n.innerHTML='<h2>Use this saved account?</h2><input type="password" value="fixture-secret-do-not-export"><button>Not now</button><button>Use saved account</button><button>Other sign-in options</button>'})
 const savedAccount=await page.evaluate(snapshot)
 assert.equal(savedAccount.interaction,true);assert.equal(savedAccount.needsLogin,false);assert(!JSON.stringify(savedAccount).includes('fixture-secret-do-not-export'))
 await page.locator('#secure').evaluate(n=>n.remove())
 const normal=await page.evaluate(snapshot);assert.equal(normal.interaction,false)
 const request={turn:'current',calls:[{id:'save',name:'planner_save_note',arguments:{content:'A "quoted" note with a path C:'+String.fromCharCode(92)+'sample'}}]}
 await page.evaluate(request=>{const body=document.querySelector('[data-message-author-role="assistant"]');body.textContent='PLANNER_TOOL_REQUEST';const wrapper=document.createElement('div'),header=document.createElement('div'),pre=document.createElement('pre'),code=document.createElement('code');header.textContent='json';code.className='language-json';code.textContent=JSON.stringify(request);pre.append(code);wrapper.append(header,pre);body.append(wrapper,document.createTextNode('END_PLANNER_TOOL_REQUEST'))},request)
 const machine=await page.evaluate(snapshot)
 const json=machine.text.match(/PLANNER_TOOL_REQUEST\s*([\s\S]*?)\s*END_PLANNER_TOOL_REQUEST/)[1].trim()
 assert.deepEqual(JSON.parse(json),request)
 await page.evaluate(request=>{document.querySelector('[data-message-author-role="assistant"]').innerText='PLANNER_TOOL_REQUEST\nJSON\n'+JSON.stringify(request)+'\nEND_PLANNER_TOOL_REQUEST'},request)
 const labeled=await page.evaluate(snapshot)
 assert.deepEqual(JSON.parse(labeled.text.match(/PLANNER_TOOL_REQUEST\s*([\s\S]*?)\s*END_PLANNER_TOOL_REQUEST/)[1].trim()),request)
 console.log('Exact native snapshot discovers inline ZIP controls, file-card buttons and generated-file links in the completed assistant turn. DOM fixture only.')
}finally{await browser.close()}
