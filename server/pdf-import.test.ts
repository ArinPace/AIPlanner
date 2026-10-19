import test from 'node:test'
import assert from 'node:assert/strict'
import {handlePdfUpload} from './cloud.js'
import {readPdf} from './planner-workspace.js'
import {handleVmWorker} from './vm.js'

function fixturePdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>']
 for(let n=0;n<3;n++){const text=`BT /F1 12 Tf 40 700 Td (Verified page ${n+1}) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents ${4+n*2} 0 R >>`,`<< /Length ${text.length} >>\nstream\n${text}\nendstream`)}
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
 let result='%PDF-1.4\n';const offsets=[0]
 for(let n=0;n<objects.length;n++){offsets.push(result.length);result+=`${n+1} 0 obj\n${objects[n]}\nendobj\n`}
 const offset=result.length;result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`
 return Buffer.from(result)
}
test('PDF tickets and finalization are owner scoped, preserve Files, and page reads reach page three',async()=>{
 const originalFetch=globalThis.fetch,pdf=fixturePdf(),id='11111111-1111-4111-8111-111111111111'
 process.env.SUPABASE_URL='https://pdf.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 let upload:any=null,state:any={folders:[],files:[],documents:[]},revision=1
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),path=url.pathname
  if(path==='/rest/v1/planner_files'){
   assert.equal(url.searchParams.get('username'),'eq.owner')
   if(request.method==='PATCH'){const patch=await request.json() as any;state=patch.state;revision=patch.revision;return Response.json([{revision}])}
   return Response.json({state,revision})
  }
  if(path==='/rest/v1/planner_uploads'){
   if(request.method==='POST'){upload=await request.json();return Response.json(null)}
   if(url.searchParams.get('username')!=='eq.owner')return Response.json(null)
   if(request.method==='PATCH'){Object.assign(upload,await request.json());return Response.json(null)}
   return Response.json(upload)
  }
  if(path.includes('/storage/v1/object/upload/sign/'))return Response.json({url:'/object/upload/sign/planner-pdfs/owner/'+id+'.pdf?token=test'})
  if(path.includes('/storage/v1/object/info/'))return Response.json({size:pdf.length})
  if(path.includes('/storage/v1/object/sign/')&&request.method==='POST')return Response.json({signedURL:'/object/sign/planner-pdfs/owner/'+id+'.pdf?token=test'})
  if(path.includes('/storage/v1/object/'))return new Response(pdf,{headers:{'Content-Type':'application/pdf'}})
  throw Error('Unexpected PDF test route '+path)
 }
 const request=(input:unknown)=>new Request('https://planner.test/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
 try{
  const ticket=await (await handlePdfUpload(request({folderId:null,name:'Reading.pdf',size:pdf.length}),'/api/files/upload/start','owner')).json() as any
  assert.equal(upload.username,'owner');assert.match(upload.storage_path,/^owner\//)
  Object.assign(upload,{status:'pending',expires_at:'2099-01-01T00:00:00Z'})
  await handlePdfUpload(request({id:ticket.id}),'/api/files/upload/finish','owner')
  assert.equal(state.documents[0].id,ticket.id);assert.equal(upload.status,'complete')
  const first=await readPdf('owner',ticket.id,1,2);assert.equal(first.nextPage,3);assert.equal(first.pageCount,3)
  const last=await readPdf('owner',ticket.id,3,2);assert.equal(last.nextPage,null);assert.match(last.pages[0].text,/Verified page 3/)
  await assert.rejects(()=>readPdf('other',ticket.id,1,2),/not available/)
  await assert.rejects(()=>handlePdfUpload(request({id:ticket.id}),'/api/files/upload/finish','other'),/PDF/)
 }finally{globalThis.fetch=originalFetch}
})

test('worker PDF imports require a running job owned by the paired host and a live lease',async()=>{
 const originalFetch=globalThis.fetch
 let active=false,writes=0
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url)
  if(url.pathname==='/rest/v1/planner_vm_hosts')return Response.json({id:'host',username:'owner',capabilities:{}})
  if(url.pathname==='/rest/v1/planner_vm_jobs'){
   assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(url.searchParams.get('host_id'),'eq.host');assert.equal(url.searchParams.get('status'),'eq.running');assert.ok(url.searchParams.has('lease_until'))
   return Response.json(active?{id:'11111111-1111-4111-8111-111111111111'}:null)
  }
  writes++;throw Error('Unauthorized write path')
 }
 const req=(lease=false)=>new Request('https://planner.test/api/agent/vm/worker/pdf-upload/start',{method:'POST',headers:{Authorization:'Bearer pvm_'+'a'.repeat(43),'Content-Type':'application/json',...(lease?{'X-Planner-Job':'11111111-1111-4111-8111-111111111111','X-Planner-Lease':'22222222-2222-4222-8222-222222222222'}:{})},body:'{}'})
 try{
  await assert.rejects(()=>handleVmWorker(req(),'/api/agent/vm/worker/pdf-upload/start'),/active job lease/)
  await assert.rejects(()=>handleVmWorker(req(true),'/api/agent/vm/worker/pdf-upload/start'),/cancelled or expired/)
  assert.equal(writes,0)
 }finally{globalThis.fetch=originalFetch}
})
