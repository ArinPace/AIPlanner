import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174')
 const result=await page.evaluate(async()=>{
  const api=await import('/src/lib/api.ts'),transfer=await import('/src/lib/filesTransfer.ts')
  api.setToken('isolated-files-transfer-test')
  let state={revision:7,folders:[],documents:[],files:Array.from({length:28},(_,i)=>({id:'note-'+i,name:'Note '+i,folderId:null,format:'note',content:'x'.repeat(900000),updatedAt:'2026-11-03T00:00:00Z'}))}
  const calls=[],originalFetch=window.fetch
  window.fetch=async(input,options={})=>{
   const url=new URL(String(input),location.href),method=options.method||'GET'
   if(url.pathname==='/api/files'&&method==='GET'){
    calls.push({type:'manifest'})
    return Response.json({format:'files-manifest',revision:state.revision,storageLimitBytes:api.getToken()==='second-account'?4194304:26214400,items:state.files.map((file,index)=>({section:'files',id:file.id,index,etag:file.updatedAt+':'+file.content.length+':'+file.content.slice(0,30)}))})
   }
   if(url.pathname==='/api/files/item'){
    calls.push({type:'file',id:url.searchParams.get('id')})
    if(Number(url.searchParams.get('revision'))!==state.revision)return Response.json({error:'Files changed while loading. Retry with the latest index.'},{status:409})
    return Response.json({revision:state.revision,item:state.files[Number(url.searchParams.get('index'))]})
   }
   if(url.pathname==='/api/files'&&method==='PATCH'){
    const patch=JSON.parse(options.body);calls.push({type:'patch',files:patch.upserts?.files?.map(file=>file.id),bytes:new TextEncoder().encode(options.body).length})
    if(patch.revision!==state.revision)return Response.json({error:'Files changed'},{status:409})
    state={...transfer.applyFilesPatch(state,patch),revision:state.revision+1}
    return Response.json({ok:true,revision:state.revision})
   }
   if(url.pathname==='/api/files'&&method==='PUT')throw new Error('Whole-workspace writes are forbidden in this test')
   return originalFetch(input,options)
  }
  const full=await api.loadFiles(),initialReads=calls.filter(call=>call.type==='file').length
  const bytes=new TextEncoder().encode(JSON.stringify(full)).length
  await api.loadFiles();const unchangedReads=calls.filter(call=>call.type==='file').length
  const next={...full,files:full.files.map(file=>file.id==='note-8'?{...file,content:'Detailed corrected error report',updatedAt:'2026-11-03T01:00:00Z'}:file)}
  const saved=await api.saveFiles(next)
  let staleRejected=false
  try{await api.saveFiles(full)}catch{staleRejected=true}
  await api.loadFiles();const refreshReads=calls.filter(call=>call.type==='file').length
  const patches=calls.filter(call=>call.type==='patch')
  api.setToken('second-account');state={revision:1,folders:[],documents:[],files:[{...state.files[8],content:'Second account only'}]}
  const second=await api.loadFiles()
  api.setToken(null)
  return {bytes,initialReads,unchangedReads,refreshReads,patches,saved,staleRejected,secondContent:second.files[0].content,secondLimit:second.storageLimitBytes,unrelatedPreserved:full.files[0].content.length===900000}
 })
 assert(result.bytes>24*1024*1024);assert.equal(result.initialReads,28);assert.equal(result.unchangedReads,28)
 assert.equal(result.refreshReads,28,'Acknowledged content does not need to be downloaded again')
 assert.equal(result.patches.length,1);assert.deepEqual(result.patches[0].files,['note-8']);assert(result.patches[0].bytes<1000)
 assert.equal(result.saved.revision,8);assert.equal(result.staleRejected,true);assert.equal(result.unrelatedPreserved,true)
 assert.equal(result.secondContent,'Second account only');assert.equal(result.secondLimit,4194304)
 console.log('PASS: 25MB workspace, individual reads, cached refresh, single-note PATCH, stale-save rejection and account switch isolation')
}finally{await browser.close()}
