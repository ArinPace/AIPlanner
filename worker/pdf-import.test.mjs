import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {downloadPdf,importPdf,importDownloadedPdf,pdfWorkerCall} from './pdf-import.mjs'
const sources={brightspace:'https://brightspace.nyu.edu',drive:'https://drive.google.com'}
const enabled=['brightspace','drive']
const pdf=Buffer.from('%PDF-1.7\nreal bytes fixture')
function response(bytes=pdf,status=200,headers={}){return {ok:()=>status>=200&&status<300,status:()=>status,headers:()=>headers,body:async()=>bytes,json:async()=>JSON.parse(bytes),dispose:async()=>{}}}

test('worker save failures report real Fetch HTTP status without masking it as a TypeError',async()=>{
 for(const status of [400,401,409,413,500])await assert.rejects(()=>pdfWorkerCall('https://planner.test',{token:'worker',jobId:'job',lease:'lease'},'start',{name:'x.pdf'},async(url,init)=>{
  assert.equal(url.pathname,'/api/agent/vm/worker/pdf-upload/start')
  assert.equal(init.headers['X-Planner-Job'],'job')
  assert.equal(init.headers['X-Planner-Lease'],'lease')
  return new Response('Rejected',{status})
 }),new RegExp('PDF save failed \\('+status+'\\)'))
 assert.deepEqual(await pdfWorkerCall('https://planner.test',{},'finish',{id:'doc'},async()=>Response.json({documents:[{id:'doc'}]})),{documents:[{id:'doc'}]})
})

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
 for(const output of [response(Buffer.from('<html>Sign in</html>')),response(pdf,302,{location:'http://127.0.0.1/private'}),response(pdf,200,{'content-length':String(51*1024*1024)})]){
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

test('PDF exports preserve an explicitly selected Google account in /u/ paths',async()=>{
 const urls=[]
 await downloadPdf({request:{get:async url=>{urls.push(url);return response()}}},'https://docs.google.com/document/u/1/d/doc123/edit',{enabled,sources})
 assert.equal(new URL(urls[0]).searchParams.get('authuser'),'1')
})

test('original PDFs between 25 and 50 MB use the direct storage upload path',async()=>{
 const large=Buffer.alloc(26*1024*1024);pdf.copy(large)
 const result=await importPdf({request:{get:async()=>response(large,200,{'content-length':String(large.length)})}},{url:'https://brightspace.nyu.edu/file.pdf',name:'Lecture10.pdf',folderId:null},{enabled,sources,workerCall:async(action,input)=>action==='start'?{id:'large',uploadUrl:'https://storage.test/upload'}:{documents:[{id:'large',kind:'pdf'}]},upload:async(url,init)=>{assert.equal(init.body.length,large.length);return {ok:true}}})
 assert(result.saved)
})

test('external originals require an exact observed link on an enabled page; arbitrary redirects remain rejected',async()=>{
 const source='https://brightspace.nyu.edu/readings',href='https://users.aalto.fi/~ave/ROS.pdf'
 const context={pages:()=>[{url:()=>source,locator:()=>({evaluateAll:async(fn,target)=>target===href})}],request:{get:async()=>response()}}
 assert.deepEqual((await downloadPdf(context,href,{enabled,sources,sourcePageUrl:source})).bytes,pdf)
 await assert.rejects(()=>downloadPdf(context,href+'?unobserved=1',{enabled,sources,sourcePageUrl:source}),/not observed/)
 await assert.rejects(()=>downloadPdf(context,'https://127.0.0.1/file.pdf',{enabled,sources,sourcePageUrl:source}),/public HTTPS/)
 context.request.get=async()=>response(pdf,302,{location:'https://unobserved.test/private.pdf'})
 await assert.rejects(()=>downloadPdf(context,href,{enabled,sources,sourcePageUrl:source}),/enabled/)
})
test('browser-downloaded originals can be registered without refetching signed provider URLs; traversal and symlinks are denied',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'planner-pdf-'))
 try{
  await mkdir(path.join(root,'browser-downloads'));await writeFile(path.join(root,'browser-downloads','original.pdf'),pdf)
  await writeFile(path.join(root,'other.pdf'),pdf);await symlink(path.join(root,'other.pdf'),path.join(root,'browser-downloads','escape.pdf'))
  let uploads=0
  const config={workerCall:async action=>action==='start'?{id:'saved',uploadUrl:'https://storage.test/upload'}:{documents:[{id:'saved',kind:'pdf'}]},upload:async(url,init)=>{assert.deepEqual(init.body,pdf);uploads++;return {ok:true}}}
  assert((await importDownloadedPdf(root,{localFile:'browser-downloads/original.pdf',name:'Original.pdf',folderId:null},config)).saved)
  for(const localFile of ['../other.pdf','browser-downloads/escape.pdf'])await assert.rejects(()=>importDownloadedPdf(root,{localFile,name:'x.pdf',folderId:null},config),/working folder/)
  assert.equal(uploads,1)
 }finally{await rm(root,{recursive:true,force:true})}
})
