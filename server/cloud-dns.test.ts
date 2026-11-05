import test from 'node:test'
import assert from 'node:assert/strict'
import {cloudDNSStatus,handleCloudDNS,readCloudDNS,setCloudDNSDomain} from './cloud-dns.js'
test('cloud DNS keeps credentials encrypted, scopes accounts, paginates verification and rejects provider error bodies',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','CONNECTION_ENCRYPTION_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://dns.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY;process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32)
 const apiKey='test-nextdns-key-not-a-real-key';let row:any=null,blocked=false,bad=false,writes=0
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url)
  if(url.hostname==='dns.test'){
   assert(url.pathname.endsWith('/planner_cloud_dns'))
   if(req.method==='POST'){const data=await req.json() as any;assert.equal(data.username,'owner');assert(!data.credentials.includes(apiKey));row=data;return new Response(null,{status:201})}
   return Response.json(url.searchParams.get('username')==='eq.owner'?row:null)
  }
  assert.equal(url.origin,'https://api.nextdns.io');assert.equal(req.headers.get('X-Api-Key'),apiKey);assert(url.pathname.startsWith('/profiles/abc123/denylist'))
  if(bad)return Response.json({errors:[{detail:'private provider diagnostic'}]})
  if(req.method==='POST'){writes++;assert.deepEqual(await req.json(),{id:'example.com',active:true});blocked=true;return Response.json({data:{}})}
  if(req.method==='DELETE'){writes++;blocked=false;return Response.json({data:{}})}
  if(url.searchParams.get('cursor')==='next')return Response.json({data:blocked?[{id:'example.com',active:true}]:[],meta:{pagination:{cursor:null}}})
  return Response.json({data:[{id:'other.com',active:true}],meta:{pagination:{cursor:'next'}}})
 }
 try{
  assert.equal((await cloudDNSStatus('owner')).connected,false)
  await assert.rejects(()=>readCloudDNS('owner'),/Connect cloud NextDNS/)
  const req=new Request('https://planner.test/api/screentime/dns',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:'abc123',apiKey})})
  const saved=await (await handleCloudDNS(req,'owner')).json();assert(!JSON.stringify(saved).includes(apiKey));assert.equal((saved as any).connected,true)
  await assert.rejects(()=>readCloudDNS('foreign'),/Connect cloud NextDNS/)
  assert.equal((await readCloudDNS('owner')).cursor,'next')
  assert.equal((await setCloudDNSDomain('owner',{domain:'example.com',blocked:true})).verified,true);assert.equal(blocked,true)
  assert.equal((await setCloudDNSDomain('owner',{domain:'example.com',blocked:true})).unchanged,true);assert.equal(writes,1)
  assert.equal((await setCloudDNSDomain('owner',{domain:'example.com',blocked:false})).blocked,false)
  await assert.rejects(()=>setCloudDNSDomain('owner',{domain:'http://localhost/private',blocked:true}));assert.equal(writes,2)
  bad=true;await assert.rejects(()=>readCloudDNS('owner'),error=>error instanceof Error&&/NextDNS could not/.test(error.message)&&!error.message.includes('private provider'))
 }finally{globalThis.fetch=old;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
})
