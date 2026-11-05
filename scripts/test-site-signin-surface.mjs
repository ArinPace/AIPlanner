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
 await page.setContent('<main><h1>ChatGPT</h1><p>No sign-in available</p></main>')
 assert.equal((await page.evaluate(script)).found,false)
 assert.equal(await page.getByRole('heading',{name:'ChatGPT'}).isVisible(),false)
 console.log('Secure surface preserves original form/submit handlers, hides chat chrome, fits phone width, follows approval changes, restores layout and exports no credential values. DOM fixtures only.')
}finally{await browser.close()}
