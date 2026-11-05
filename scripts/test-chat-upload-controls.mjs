import {chromium} from 'playwright-core'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const swift=fs.readFileSync(new URL('../ios/AIPlanner/PlannerWebView.swift',import.meta.url),'utf8')
const script=swift.split('traceRelay("upload-start")')[1].split('"""')[1]
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.setContent(`<input type="file" multiple><div role="progressbar" hidden></div><script>
 window.uploads=0;
 document.querySelector('input').onchange=e=>{uploads++;for(const f of e.target.files){const b=document.createElement('button');b.setAttribute('aria-label','Remove '+f.name.replace(/([.][^.]+)$/,'(2)$1'));document.body.append(b)}};
 </script>`)
 const files=['picture.png','data.zip','notes.txt'].map(name=>({name,mime:'application/octet-stream',data:'data:application/octet-stream;base64,dGVzdA=='}))
 const run=prepared=>page.evaluate(async({script,files,prepared})=>new Function('files','prepared',`return (async()=>{${script}})()`)(files,prepared),{script,files,prepared})
 assert.equal(await run(false),true)
 assert.equal(await page.evaluate(()=>uploads),1)
 assert.equal(await run(true),true)
 assert.equal(await page.evaluate(()=>uploads),1)
 console.log('Exact native upload controls accept image thumbnails and renamed repeated files, ignore hidden progress, and reuse confirmed prepared attachments. DOM fixture only.')
}finally{await browser.close()}
