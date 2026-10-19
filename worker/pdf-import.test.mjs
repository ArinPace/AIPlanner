import test from 'node:test'
import assert from 'node:assert/strict'
import {downloadPdf,importPdf} from './pdf-import.mjs'
const sources={brightspace:'https://brightspace.nyu.edu',drive:'https://drive.google.com'}
const enabled=['brightspace','drive']
const pdf=Buffer.from('%PDF-1.7\nreal bytes fixture')
function response(bytes=pdf,status=200,headers={}){return {ok:()=>status>=200&&status<300,status:()=>status,headers:()=>headers,body:async()=>bytes,json:async()=>JSON.parse(bytes),dispose:async()=>{}}}

test('Brightspace topic resolves its original file; upload transfers exact PDF bytes without model output',async()=>{
 const urls=[],calls=[]
 const context={request:{get:async(url,options)=>{urls.push(url);assert.equal(options.maxRedirects,0);return url.includes('/content/topics/')?response(Buffer.from(JSON.stringify({Url:'/content/enforced/course/syllabus.pdf'})),200,{'content-type':'application/json'}):response()}}}
 const result=await importPdf(context,{url:'https://brightspace.nyu.edu/d2l/le/content/123/viewContent/456/View',folderId:'folder',name:'Syllabus.pdf'},{enabled,sources,workerCall:async(action,input)=>{calls.push({action,input});return action==='start'?{id:'doc',uploadUrl:'https://storage.test/upload'}:{documents:[{id:'doc',kind:'pdf',name:'Syllabus.pdf'}],revision:2}},upload:async(url,init)=>{assert.equal(url,'https://storage.test/upload');assert.deepEqual(init.body,pdf);return {ok:true}}})
 assert.equal(result.saved,true);assert.equal(result.document.id,'doc');assert.equal(calls[0].input.size,pdf.length)
 assert.equal(urls[1],'https://brightspace.nyu.edu/content/enforced/course/syllabus.pdf')
 assert.equal(JSON.stringify(result).includes('%PDF'),false)
})

test('preview/login HTML, unsafe redirects and oversized files cannot be imported',async()=>{
 const url='https://brightspace.nyu.edu/file.pdf'
 for(const output of [response(Buffer.from('<html>Sign in</html>')),response(pdf,302,{location:'http://127.0.0.1/private'}),response(pdf,200,{'content-length':String(26*1024*1024)})]){
  let uploads=0
  await assert.rejects(()=>importPdf({request:{get:async()=>output}},{url,name:'x.pdf',folderId:null},{enabled,sources,workerCall:async()=>{uploads++}}))
  assert.equal(uploads,0)
 }
 await assert.rejects(()=>downloadPdf({request:{get:async()=>response()}},'https://brightspace.nyu.edu/file.pdf',{enabled:['drive'],sources}),/enabled/)
})

test('Google Docs exports PDF, checks each redirect and only reports verified registered imports',async()=>{
 const urls=[]
 const result=await downloadPdf({request:{get:async url=>{urls.push(url);return urls.length===1?response(pdf,302,{location:'https://doc-test.googleusercontent.com/export.pdf'}):response()}}},'https://docs.google.com/document/d/doc123/edit',{enabled,sources})
 assert.match(urls[0],/export\?format=pdf/);assert.deepEqual(result.bytes,pdf)
 await assert.rejects(()=>importPdf({request:{get:async()=>response()}},{url:'https://brightspace.nyu.edu/file.pdf',name:'x.pdf',folderId:null},{enabled,sources,workerCall:async action=>action==='start'?{id:'doc',uploadUrl:'https://storage.test/upload'}:{documents:[]},upload:async()=>({ok:true})}),/not registered/)
})
