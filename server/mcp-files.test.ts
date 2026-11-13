import test from 'node:test'
import assert from 'node:assert/strict'
import {startFileUpload,finishFileUpload,downloadPlannerFile} from './mcp-files.js'
import type {FilesState,PlannerDocument} from '../src/lib/files.js'
const ticket='a1111111-1111-4111-8111-111111111111'
async function fixture(run:(context:{state:FilesState;setRevision:(n:number)=>void;commits:unknown[];setComplete:(v:boolean)=>void})=>Promise<void>){
 const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://mcp-files.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 const state:FilesState={folders:[{id:'destination',parentId:null,name:'Test',color:'#123456',labels:[],updatedAt:new Date().toISOString()}],files:[],documents:[]},commits:unknown[]=[];let revision=3,complete=true
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(url.pathname.includes('/rest/v1/rpc/')){
   const args=await req.json() as any;assert.equal(args.p_username,'owner')
   if(table==='planner_files_manifest')return Response.json({revision,items:state.documents!.map((value,index)=>({section:'documents',index,id:value.id,value}))})
   assert.equal(table,'planner_workspace_delta_commit');assert.equal(args.p_revision,revision);commits.push(args);state.documents=args.p_upserts.documents;revision++;return Response.json({revision})
  }
  if(url.pathname.includes('/rest/v1/')){
   if(req.method!=='POST')assert.equal(url.searchParams.get('username'),'eq.owner')
   if(table==='planner_files')return Response.json({state,revision})
   assert.equal(table,'planner_subscription_files')
   if(req.method==='POST'){const row=await req.json() as any;assert.equal(row.username,'owner');assert.equal(row.chat_id,null);return new Response(null,{status:201})}
   if(url.searchParams.get('id')?.startsWith('eq.'))return Response.json({id:ticket,name:'example.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:10,status:complete?'complete':'pending',storage_path:'owner-test'})
   return Response.json([{id:ticket,size:10,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',status:complete?'complete':'pending'}])
  }
  if(url.pathname.includes('/storage/v1/object/info/'))return Response.json({size:9})
  if(url.pathname.includes('/storage/v1/object/upload/sign/'))return Response.json({url:'/object/upload/sign/planner-chat-files/fixture?token=test'})
  if(url.pathname.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/planner-chat-files/fixture?token=test'})
  throw Error('Unexpected route '+url.pathname)
 }
 try{await run({state,commits,setRevision:n=>{revision=n},setComplete:v=>{complete=v}})}finally{globalThis.fetch=original;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}}
}
test('general file upload works without a conversation; finish retries do not duplicate files',()=>fixture(async({state,commits})=>{
 const started=await startFileUpload('owner',{name:'example.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:10});assert.ok(started.uploadUrl);assert.equal(started.method,'PUT')
 const args={id:ticket,folderId:'destination',revision:3};const saved=await finishFileUpload('owner',args);assert.equal(saved.document.id,ticket);assert.equal(saved.document.size,10);assert.equal(commits.length,1)
 const retry=await finishFileUpload('owner',args);assert.equal(retry.replayed,true);assert.equal(commits.length,1);assert.equal(state.documents!.length,1)
 const download=await downloadPlannerFile('owner',ticket);assert.ok('downloadUrl' in download);assert.equal(download.name,'example.xlsx')
}))
test('stale revision, invalid destination and incomplete bytes never register a file',()=>fixture(async({setComplete,commits})=>{
 await assert.rejects(()=>finishFileUpload('owner',{id:ticket,folderId:'destination',revision:2}),/Files changed/)
 await assert.rejects(()=>finishFileUpload('owner',{id:ticket,folderId:'missing',revision:3}),/Destination/)
 setComplete(false);await assert.rejects(()=>finishFileUpload('owner',{id:ticket,folderId:'destination',revision:3}),/size does not match/);assert.equal(commits.length,0)
}))
test('byte replacement keeps the existing document identity and leaves unrelated state intact',()=>fixture(async({state,commits})=>{
 const old:PlannerDocument={id:'original',folderId:'destination',name:'My workbook',kind:'attachment',chatFileId:'b1111111-1111-4111-8111-111111111111',mime:'application/octet-stream',size:3,updatedAt:new Date().toISOString()};state.documents=[old]
 const saved=await finishFileUpload('owner',{id:ticket,folderId:'destination',revision:3,replaceId:'original'});assert.equal(saved.document.id,'original');assert.equal(saved.document.name,'My workbook');assert.equal(saved.document.chatFileId,ticket);assert.equal(state.folders[0].name,'Test');assert.equal(commits.length,1)
 await assert.rejects(()=>downloadPlannerFile('owner','someone-elses-file'),/not found/)
}))
