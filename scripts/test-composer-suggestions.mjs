import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const script=swift.split('// BEGIN_CHAT_COMPOSER_READER')[1].split('#"""\n')[1].split('"""#')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.setContent('<div contenteditable="true" data-composer-markdown><p><br></p><span contenteditable="false">Suggested reply<span>Press Tab to accept</span></span></div>')
 await page.evaluate(script)
 const read=()=>page.evaluate(()=>window.__plannerComposerText(window.__plannerComposer()))
 assert.equal(await read(),'','An unaccepted follow-up suggestion is not a draft')
 await page.evaluate(()=>document.querySelector('p').textContent='Actual draft')
 assert.equal((await read()).trim(),'Actual draft','A real draft beside a suggestion remains protected')
 await page.setContent('<div contenteditable="true" data-composer-markdown><p>Press Tab to accept is literal text <span contenteditable="false" data-type="mention">@Gmail</span></p></div>')
 assert.match(await read(),/Press Tab to accept is literal text @Gmail/,'Keep real text and noneditable mentions')
 await page.setContent('<div contenteditable="true" data-composer-markdown><p><br></p><span data-ghost-text>Suggestion without keyboard hint</span></div>')
 assert.equal(await read(),'')
 await page.setContent('<form><h2>Sign in to duosecurity.com</h2><label>Passcode<input type="text" autocomplete="off" aria-label="Passcode"></label><button>Submit</button></form>')
 await page.evaluate(()=>{const input=document.querySelector('input');Object.defineProperty(input,'value',{get(){throw Error('Credential value must never be read')}})})
 assert.equal(await page.evaluate(()=>window.__plannerSignInState().credentialRequired),true,'A text passcode field must open private credential entry')
 await page.setContent('<input type="text" aria-label="Search messages">')
 assert.equal(await page.evaluate(()=>window.__plannerSignInState().credentialRequired),false,'An ordinary search field must not trigger private entry')
 console.log('Composer suggestions: unaccepted decorations excluded; actual drafts, literal text and mentions preserved.')
}finally{await browser.close()}
