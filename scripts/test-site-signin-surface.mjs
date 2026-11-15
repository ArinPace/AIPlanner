import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const script=swift.split('// BEGIN_SITE_SIGNIN_SURFACE')[1].split('#"""')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.setContent(`<header id="chat-header">ChatGPT</header><div class="thread"><article id="reply">Private conversation</article><div class="fixed"><form id="secure"><div style="width:512px"><h2>Sign in to login.microsoftonline.com</h2><label>Password<input type="password" value="fixture-never-export"></label><button type="submit">Sign in</button></div></form></div><footer id="composer">Message ChatGPT</footer></div>`)
 await page.evaluate(()=>{window.originalSecureForm=document.querySelector('form');window.submits=0;window.originalSecureForm.onsubmit=e=>{e.preventDefault();window.submits++}})
 const result=await page.evaluate(script)
 assert.equal(result.found,true);assert.equal(result.domain,'login.microsoftonline.com');assert(!JSON.stringify(result).includes('fixture-never-export'))
 assert.equal(await page.locator('#chat-header').isVisible(),false);assert.equal(await page.locator('#reply').isVisible(),false);assert.equal(await page.locator('#composer').isVisible(),false)
 assert(await page.locator('input[type=password]').isVisible())
 const rect=await page.locator('#secure').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=390)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.submits),1);assert(await page.evaluate(()=>document.querySelector('form')===window.originalSecureForm))
 await page.evaluate(()=>{document.querySelector('form').remove();document.querySelector('.fixed').innerHTML='<section role="dialog"><p>Allow browser access to this website?</p><button>Allow</button></section>'})
 await page.getByRole('button',{name:'Allow',exact:true}).waitFor({state:'visible'})
 assert.equal(await page.locator('#reply').isVisible(),false)
 await page.evaluate(()=>window.__plannerSiteSignIn.restore());assert(await page.locator('#reply').isVisible())

 await page.setContent('<header id="chat-header">ChatGPT</header><article id="reply">Private conversation</article><div><p>https://login.microsoftonline.com</p><h2>Use this saved account?</h2><input type="password" value="fixture-never-export"><button>Not now</button><button style="white-space:nowrap">Use saved account</button><button>Other sign-in options</button></div>')
 const saved=await page.evaluate(script);assert.equal(saved.found,true);assert(!JSON.stringify(saved).includes('fixture-never-export'));assert.equal(await page.getByRole('button',{name:'Use saved account',exact:true}).evaluate(n=>getComputedStyle(n).whiteSpace),'normal')
 assert.equal(await page.locator('#reply').isVisible(),false);assert(await page.getByRole('button',{name:'Use saved account',exact:true}).isVisible())
 await page.evaluate(()=>window.__plannerSiteSignIn.restore())
 await page.setContent('<main><h1>ChatGPT</h1><p>No sign-in available</p></main>')
 assert.equal((await page.evaluate(script)).found,false)
 assert.equal(await page.getByRole('heading',{name:'ChatGPT'}).isVisible(),true)
 await page.evaluate(()=>window.__plannerSiteSignIn.restore())
 const composer=swift.split('// BEGIN_CHAT_COMPOSER_READER')[1].split('#"""\n')[1].split('"""#')[0]
 await page.evaluate(composer)
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844})
  await page.setContent(`<style>body{margin:0;font:16px system-ui}#host{position:fixed;left:50%;top:75%;width:640px;transform:translate(-50%,-50%)}#card{width:512px;padding:24px;border:1px solid gray}input{width:420px}button{white-space:nowrap;min-width:110px}</style><header id="chrome">ChatGPT</header><div id="react"><article id="history">Private conversation</article><div id="host"><section id="card"><p>https://login.microsoftonline.com</p><h2>Sign in to login.microsoftonline.com</h2><form><label>Password<input id="secret" aria-label="Fixture password" type="password"></label><p id="error" role="alert"></p><div style="display:flex;gap:12px;justify-content:flex-end"><button type="button" id="sso">Other sign-in options</button><button type="submit">Sign in</button></div></form></section></div><footer id="chat-compose"><textarea></textarea></footer></div>`)
  await page.evaluate(()=>{
   const input=document.querySelector('#secret'),value=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');window.secretReads=0;window.monitorSecret=true
   Object.defineProperty(input,'value',{get(){if(window.monitorSecret)window.secretReads++;return value.get.call(this)},set(v){value.set.call(this,v)}})
   window.originalParent=input.closest('form').parentElement;window.originalForm=input.closest('form');window.delegatedSubmits=0
   document.querySelector('#react').addEventListener('submit',e=>{e.preventDefault();window.delegatedSubmits++;if(input.value!=='fixture-only')document.querySelector('#error').textContent='Try again';else document.querySelector('#error').textContent='Accepted'})
   document.querySelector('#sso').onclick=()=>{const popup=window.open('about:blank','fixture-sso');popup.document.write('<h1>SSO fixture</h1><button onclick="opener.document.getElementById(\'error\').textContent=\'SSO returned\';window.close()">Return to sign-in</button>')}
  })
  const isolated=await page.evaluate(script);assert.equal(isolated.domain,'login.microsoftonline.com');assert.deepEqual(Object.keys(isolated).sort(),['domain','found'])
  assert.equal(await page.evaluate(()=>window.secretReads),0)
  assert(await page.evaluate(()=>document.querySelector('form')===window.originalForm&&window.originalForm.parentElement===window.originalParent))
  for(const locator of [page.locator('#card'),page.getByLabel('Fixture password'),page.getByRole('button',{name:'Sign in',exact:true}),page.getByRole('button',{name:'Other sign-in options',exact:true})]){
   const rect=await locator.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1,`${width}px: all form controls must fit`)
  }
  assert.equal(await page.locator('#chrome').isVisible(),false);assert.equal(await page.locator('#history').isVisible(),false);assert.equal(await page.locator('#chat-compose').isVisible(),false)
  await page.evaluate(()=>window.monitorSecret=false)
  await page.getByLabel('Fixture password').fill('fixture-only')
  await page.getByLabel('Fixture password').focus()
  await page.evaluate(()=>{window.monitorSecret=true;window.__plannerSiteSignIn.refresh()})
  assert.equal(await page.evaluate(()=>window.secretReads),0);assert(await page.getByLabel('Fixture password').evaluate(n=>document.activeElement===n))
  await page.evaluate(()=>window.monitorSecret=false)
  await page.getByRole('button',{name:'Sign in',exact:true}).click();assert.equal(await page.evaluate(()=>window.delegatedSubmits),1)
  await page.setViewportSize({width,height:340})
  await page.getByRole('button',{name:'Other sign-in options',exact:true}).scrollIntoViewIfNeeded()
  const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'Other sign-in options',exact:true}).click();const popup=await popupEvent
  assert(await popup.evaluate(()=>Boolean(window.opener)));await popup.getByRole('button',{name:'Return to sign-in'}).click();await page.getByText('SSO returned',{exact:true}).waitFor()
  await page.evaluate(()=>{document.querySelector('#card').innerHTML='<form><h2>Verify your identity</h2><input autocomplete="one-time-code" aria-label="Fixture code"><button>Verify</button></form>'})
  await page.getByLabel('Fixture code').waitFor();assert.equal((await page.evaluate(()=>window.__plannerSiteSignIn.refresh())).domain,'login.microsoftonline.com')
  await page.evaluate(()=>{const modal=document.createElement('section');modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;width:600px;left:-100px;top:500px;transform:translateX(-40%)';modal.innerHTML='<h2>Allow browser access to this website?</h2><button>Allow</button>';document.body.append(modal)})
  await page.getByRole('button',{name:'Allow',exact:true}).waitFor();assert.equal(await page.locator('#card').isVisible(),false)
  const consent=await page.getByRole('dialog').boundingBox();assert(consent.x>=0&&consent.x+consent.width<=width+1)
  await page.evaluate(()=>window.__plannerSiteSignIn.restore());assert(await page.locator('#history').isVisible());assert.equal(await page.locator('[data-planner-secure-root],[data-planner-secure-path],[data-planner-secure-fit]').count(),0)
 }
 await page.setContent('<header id="thread">Private conversation</header><section><p>Something went wrong, please take over to sign in</p><div><button>Not now</button><button>Take over</button></div></section>')
 assert.equal((await page.evaluate(script)).found,true)
 assert.equal(await page.locator('#thread').isVisible(),false)
 assert(await page.getByRole('button',{name:'Take over',exact:true}).isVisible())
 await page.evaluate(()=>window.__plannerSiteSignIn.restore())
 await page.setContent('<main><article data-turn-key="old" data-talvt-turn-state="complete"><form><h2>Sign in to old.example.com</h2><input type="password"><button>Sign in</button></form></article><article data-turn-key="new"><div data-message-author-role="assistant">A newer reply</div></article></main>')
 assert.equal((await page.evaluate(script)).found,false,'Completed historical forms must not become a login sheet')
 await page.evaluate(()=>window.__plannerSiteSignIn.restore())
 console.log('Focused Planner sign-in: responsive fixed/translated panels, keyboard-size viewport, original delegated submit handlers, popup/opener return, MFA and replacement consent dialogs, cancel/restore, historical-form rejection, and zero password reads passed.')
}finally{await browser.close()}
