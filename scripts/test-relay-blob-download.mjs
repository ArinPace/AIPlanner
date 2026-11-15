import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
const source=fs.readFileSync('ios/AIPlanner/PlannerWebView.swift','utf8').split('private static var blobDownloadCapture: String { #"""')[1].split('"""# }')[0]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage();await page.route('https://chatgpt.com/**',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));await page.goto('https://chatgpt.com/c/fixture')
 await page.evaluate(()=>{window.captures=[];window.captureActive=true;window.webkit={messageHandlers:{plannerResponseFile:{postMessage:async message=>{if(message.action==='check')return {active:window.captureActive,generation:'fixture-transfer'};window.captures.push(message);return {ok:true}}}}}})
 await page.evaluate(source)
 for(const ext of ['pdf','docx','xlsx','pptx']){
  const bytes=fs.readFileSync('ios/AIPlannerUITests/Fixtures/Relay/verification.'+ext),name='verification.'+ext
  await page.evaluate(({name,data})=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)},{name,data:bytes.toString('base64')})
  await page.waitForFunction(name=>window.captures.some(m=>m.name===name),name)
  const captured=await page.evaluate(name=>window.captures.find(m=>m.name===name),name);assert.equal(captured.generation,'fixture-transfer')
  assert.equal(crypto.createHash('sha256').update(Buffer.from(captured.data.split(',')[1],'base64')).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'))
 }
 await page.evaluate(()=>{window.captureActive=false;const a=document.createElement('a');a.href='data:text/plain;base64,bm90LWF1dGhvcml6ZWQ=';a.download='inactive.txt';document.body.append(a);a.click()})
 await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.captures)).length,4)
 console.log('Detached PDF/DOCX/XLSX/PPTX blob anchors survive immediate URL revocation with matching bytes; inactive transfers export nothing.')
}finally{await browser.close()}
