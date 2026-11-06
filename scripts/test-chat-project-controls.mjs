import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const project=swift.split('// BEGIN_CHAT_PROJECT_SCRIPT')[1].split('#"""\n')[1].split('"""#')[0]
const composer=swift.split('// BEGIN_CHAT_COMPOSER_READER')[1].split('#"""\n')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<title>ChatGPT</title><button onclick="document.querySelector('aside').hidden=false">Show sidebar</button><aside hidden><button id="add">Add new project</button><ul></ul></aside><div contenteditable="true" role="textbox"><p data-empty-paragraph="true" data-placeholder="Ask ChatGPT"><br></p></div><script>
 window.created=0;window.sent=0;
 const row=name=>{const li=document.createElement('li');li.innerHTML='<span>'+name+'</span><button aria-label="Project actions for '+name+'">...</button>';li.querySelector('span').onclick=()=>{history.replaceState(null,'','/g/g-p-fixture-'+name+'/project');document.title='ChatGPT - '+name};document.querySelector('ul').append(li)};
 document.querySelector('#add').onclick=()=>{const d=document.createElement('div');d.role='dialog';d.innerHTML='<input type="text" placeholder="Copenhagen Trip"><button disabled>Create project</button>';d.querySelector('input').oninput=e=>d.querySelector('button').disabled=!e.target.value;d.querySelector('button').onclick=()=>{row(d.querySelector('input').value);created++;d.remove()};document.body.append(d)};
 </script>`}))
 await page.goto('https://chatgpt.com/')
 const execute=()=>page.evaluate(async script=>new Function('projectName',`return (async()=>{${script}})()` )('Test'),project)
 const submit=swift.split('traceRelay("submit-start"); browser.becomeFirstResponder()')[1].split('let result = try await browser.callAsyncJavaScript("""\n')[1].split('\n        """, arguments:')[0]
 const guardedSend=(projectPath='/g/g-p-fixture-Test')=>page.evaluate(async ({script,projectPath})=>new Function('projectPath','text','clearTestDraft',`return (async()=>{${script}})()` )(projectPath,'Do not send outside Test',false),{script:submit,projectPath})
 await assert.rejects(guardedSend,/left the Test project/)
 await page.evaluate(()=>history.replaceState(null,'','/g/g-p-fixture-Other/c/existing'))
 await assert.rejects(guardedSend,/left the Test project/)
 await page.evaluate(()=>history.replaceState(null,'','/c/existing'))
 await assert.rejects(guardedSend,/left the Test project/)
 await page.evaluate(()=>history.replaceState(null,'','/g/g-p-6aec8f9525e4819185b897403898926d-test/c/existing'))
 await assert.rejects(guardedSend('/g/g-p-6aec8f9525e4819185b897403898926d'),/__plannerComposer/)
 await assert.rejects(guardedSend('/g/g-p-6aec8f9525e4819185b897403898926e'),/left the Test project/)
 await page.evaluate(()=>history.replaceState(null,'','/'))
 const first=await execute();assert.equal(first.name,'Test');assert.equal(first.created,true);assert.equal(first.url,'https://chatgpt.com/g/g-p-fixture-Test/project')
 const second=await execute();assert.equal(second.created,false);assert.equal(await page.evaluate(()=>created),1);assert.equal(await page.evaluate(()=>sent),0)
 await page.evaluate(composer)
 assert.equal(await page.evaluate(()=>window.__plannerComposerText(document.querySelector('[contenteditable]'))),'')
 await page.locator('[contenteditable]').fill('An actual unsent draft')
 assert.equal(await page.evaluate(()=>window.__plannerComposerText(document.querySelector('[contenteditable]'))),'An actual unsent draft')
 assert.equal(await page.evaluate(()=>window.__plannerHumanDraft),true)
 await page.evaluate(()=>{const b=document.createElement('button');b.textContent='Log in';document.body.append(b)})
 await assert.rejects(execute,/Sign in to ChatGPT/)
 assert.equal(await page.evaluate(()=>created),1)
 console.log('Exact native project script creates/reuses Test once and rejects guest sessions; empty placeholders stay empty and real drafts are preserved. Fixture verification only.')
}finally{await browser.close()}
