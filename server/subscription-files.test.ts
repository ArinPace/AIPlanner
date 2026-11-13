import test from 'node:test'
import assert from 'node:assert/strict'
import {assertRelayFileReferences,subscriptionFileAction} from './subscription-files.js'
test('relay file download checks ownership before issuing any signed URL',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://file.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 let signed=0
 globalThis.fetch=async(input,init)=>{const r=new Request(input,init),u=new URL(r.url);if(u.pathname.includes('/rest/v1/planner_subscription_files')){assert.equal(u.searchParams.get('username'),'eq.owner');return Response.json(null)}signed++;throw Error('Must not sign an unowned file')}
 try{await assert.rejects(()=>subscriptionFileAction('owner',{action:'file_download',id:'a1111111-1111-4111-8111-111111111111'}),/not found/);assert.equal(signed,0)}finally{globalThis.fetch=old;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}}
})

test('saving a chat attachment to Files requires a complete owned file with matching metadata',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://file.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 const item={chatFileId:'a1111111-1111-4111-8111-111111111111',size:123,mime:'application/pdf'}
 let rows:unknown[]=[{id:item.chatFileId,size:123,mime:'application/pdf',status:'complete'}]
 globalThis.fetch=async(input,init)=>{const r=new Request(input,init),u=new URL(r.url);assert.equal(r.method,'GET');assert.ok(u.pathname.endsWith('/planner_subscription_files'));assert.equal(u.searchParams.get('username'),'eq.owner');return Response.json(rows)}
 try{
  await assertRelayFileReferences('owner',[item]);rows=[];await assert.rejects(()=>assertRelayFileReferences('owner',[item]),/not available/)
  rows=[{id:item.chatFileId,size:123,mime:'application/pdf',status:'pending'}];await assert.rejects(()=>assertRelayFileReferences('owner',[item]),/not available/)
  rows=[{id:item.chatFileId,size:124,mime:'application/pdf',status:'complete'}];await assert.rejects(()=>assertRelayFileReferences('owner',[item]),/not available/)
  rows=[{id:item.chatFileId,size:123,mime:'text/html',status:'complete'}];await assert.rejects(()=>assertRelayFileReferences('owner',[item]),/not available/)
 }finally{globalThis.fetch=old;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}}
})
