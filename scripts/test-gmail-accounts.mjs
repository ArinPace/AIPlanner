import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const script=swift.split('// BEGIN_GMAIL_CONNECTED_ACCOUNTS')[1].split('#"""')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<aside>Unrelated other@example.com</aside><section id="accounts"><div><span>Connected accounts</span></div><div>school@example.com</div><button>Connect another account</button></section>'}))
 await page.goto('https://chatgpt.com/settings/plugins-settings/plugin_connector_1p_95d39881713c8191931482a62d6edff9')
 assert.deepEqual(await page.evaluate(script),['school@example.com'])
 await page.evaluate(()=>{const row=document.createElement('div');row.textContent='Personal@Example.com';document.querySelector('#accounts').append(row)})
 assert.deepEqual(await page.evaluate(script),['school@example.com','personal@example.com'])
 await page.goto('https://chatgpt.com/c/fixture')
 assert.equal(await page.evaluate(script),null,'Conversation text is never interpreted as connected accounts')
 await page.goto('https://chatgpt.com/settings/plugins-settings/plugin_connector_1p_95d39881713c8191931482a62d6edff9')
 await page.setContent('<form><input type="password" value="fixture-only"><p>school@example.com</p></form>')
 assert.equal(await page.evaluate(script),null,'Private forms are not scanned for account identities')
 console.log('Gmail account list reader: scoped settings route, multiple accounts, unrelated email exclusion and private-form exclusion passed.')
}finally{await browser.close()}
