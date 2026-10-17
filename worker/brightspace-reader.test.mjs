import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {brightspaceContents} from './brightspace-reader.mjs'
import {resumeGradescope} from './gradescope-launch.mjs'

const toc={Modules:[{Title:'Course links',Topics:[{TopicId:10,Title:'Gradescope',Url:'/d2l/le/lti/launch/fixture'},{TopicId:11,Title:'Hidden topic',IsHidden:true},{TopicId:12,Title:'Reading',Url:'https://docs.google.com/document/d/fixture/edit'}]}]}
const response=()=>({ok:()=>true,headers:()=>({'content-type':'application/json'}),body:async()=>Buffer.from(JSON.stringify(toc)),dispose:async()=>{}})
test('course index respects hidden items and keeps SSO launch routes out of reader output',async()=>{
  const calls=[],context={request:{get:async url=>{calls.push(url);return response()}}}
  const index=await brightspaceContents(context,'https://brightspace.nyu.edu/d2l/home/123')
  assert.equal(index.topics.length,2);assert.equal(index.topics[0].launchUrl,undefined)
  assert.match(index.topics[1].documentUrl,/docs.google.com/)
  assert.equal(calls[0],'https://brightspace.nyu.edu/d2l/api/le/1.82/123/content/toc')
  assert.equal(await brightspaceContents(context,'https://evil.test/d2l/home/123'),null)
})
test('Gradescope resumes only the unambiguous course LTI route, stops at login and preserves existing tabs',async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try{
    const context=await browser.newContext()
    const adapter={request:{get:async()=>response()},pages:()=>context.pages(),newPage:()=>context.newPage()}
    assert.ok((await brightspaceContents(adapter,'https://brightspace.nyu.edu/d2l/home/123',{includeLaunch:true})).topics[0].launchUrl)
    const existing=await context.newPage()
    await context.route('https://brightspace.nyu.edu/d2l/le/lti/launch/fixture',r=>r.fulfill({contentType:'text/html',body:'<script>location.href="https://www.gradescope.com/account"</script>'}))
    await context.route('https://www.gradescope.com/account',r=>r.fulfill({body:'Your Courses Account Dashboard'}))
    assert.equal(await resumeGradescope(adapter,'https://brightspace.nyu.edu/d2l/home/123',{timeout:5000}),true)
    assert.equal(existing.isClosed(),false);assert.equal(context.pages().length,1)
    await context.route('https://www.gradescope.com/account',r=>r.fulfill({body:'Log in to Gradescope <input type="password">'}))
    assert.equal(await resumeGradescope(adapter,'https://brightspace.nyu.edu/d2l/home/123',{timeout:1000}),false)
    assert.equal(context.pages().length,1)
  }finally{await browser.close()}
})

test('description-only courses retain module material instead of appearing empty',async()=>{
 const data={Modules:[{ModuleId:55,Title:'Syllabus',Topics:[],Modules:[],Description:{Text:'Read the syllabus',Html:'<a href="https://docs.google.com/document/d/example/edit">Syllabus</a>'}},{ModuleId:56,Title:'Hidden',IsHidden:true,Description:{Text:'Do not expose'}}]};
 const context={request:{get:async()=>({ok:()=>true,headers:()=>({'content-type':'application/json'}),body:async()=>Buffer.from(JSON.stringify(data)),dispose:async()=>{}})}};
 const result=await brightspaceContents(context,'https://brightspace.nyu.edu/d2l/le/lessons/123');assert.equal(result.topics.length,0);assert.equal(result.modules.length,1);assert.equal(result.modules[0].text,'Read the syllabus');assert.match(result.modules[0].descriptionHtml,/docs.google.com/);
})
