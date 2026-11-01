import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {nativeContext,nativeLoginResult,redeemNativeLogin,nativeConnectionBootstrap,nativeConnectionStart,nativeConnectionReturn} from './native-auth.js'
import {handleAccountAuth} from './account-auth.js'
import {sealVmCredential} from './vm-vault.js'
import {tokenHash} from './auth.js'

test('native Google sign-in binds handoff to the calling app proof; tickets stay out of URLs and JSON',async()=>{
 process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32);process.env.GOOGLE_CLIENT_ID='native-test';process.env.GOOGLE_CLIENT_SECRET='private-test';process.env.SUPABASE_URL='https://native-auth.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const verifier='v'.repeat(43),state='s'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url'),ticket='a'.repeat(64)
 assert.throws(()=>nativeContext(new URL('https://planner.test/?challenge=bad&state=x')))
 const context=nativeContext(new URL('https://planner.test/?'+new URLSearchParams({challenge,state})))
 const started=await handleAccountAuth(new Request('https://aiplanner-ten.vercel.app/api/auth/google/native/start?'+new URLSearchParams(context)),'/api/auth/google/native/start')
 assert.equal(started!.status,303);assert.equal(new URL(started!.headers.get('location')!).origin,'https://accounts.google.com');assert.match(started!.headers.get('set-cookie')!,/HttpOnly; Secure/)
 const response=nativeLoginResult('success',context,ticket),callback=new URL(response.headers.get('location')!)
 assert.equal(callback.protocol,'aiplanner:');assert.equal(callback.host,'auth');assert.equal(callback.searchParams.get('state'),state);assert(!callback.toString().includes(ticket))
 const bridge=callback.searchParams.get('bridge')!,original=globalThis.fetch
 let available=true
 globalThis.fetch=async(input,init)=>{const url=new URL(new Request(input,init).url);assert(url.pathname.endsWith('/planner_login_tickets'));assert.equal(url.searchParams.get('token_hash'),'eq.'+tokenHash(ticket));return Response.json(available?{token_hash:tokenHash(ticket)}:null)}
 const request=(bridge:string,verifier:string)=>new Request('https://aiplanner-ten.vercel.app/api/auth/google/native/redeem',{method:'POST',body:JSON.stringify({bridge,verifier})})
 try{
  await assert.rejects(()=>redeemNativeLogin(request(bridge,'wrong-proof')),/verified/)
  await assert.rejects(()=>redeemNativeLogin(request(sealVmCredential({kind:'planner-native-login',ticket,challenge,expiresAt:1}),verifier)),/verified/)
  const redeemed=await redeemNativeLogin(request(bridge,verifier));assert.deepEqual(await redeemed.json(),{ready:true});assert.match(redeemed.headers.get('set-cookie')!,/HttpOnly; Secure/)
  available=false;await assert.rejects(()=>redeemNativeLogin(request(bridge,verifier)),/completed or expired/)
 }finally{globalThis.fetch=original}
})
test('native Calendar connection keeps the original browser-bound Google grant and returns only to the originating app state',async()=>{
 process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32);process.env.GOOGLE_CLIENT_ID='native-test';process.env.SUPABASE_URL='https://native-auth.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const browserToken='b'.repeat(64),state='s'.repeat(43),oauthState='c'.repeat(64),verifier='proof',nonce='nonce',scope='openid email calendar'
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:'native-test',redirect_uri:'https://aiplanner-ten.vercel.app/api/agent/oauth/callback/google',state:oauthState,nonce,scope,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString()
 const original=globalThis.fetch
 globalThis.fetch=async()=>Response.json({browser_hash:tokenHash(browserToken),nonce,verifier,requested_scopes:scope})
 const request=(value:unknown)=>new Request('https://aiplanner-ten.vercel.app/api/auth/native/connection/bootstrap',{method:'POST',body:JSON.stringify(value)})
 try{
  await assert.rejects(()=>nativeConnectionBootstrap(request({url:'https://attacker.test',browserToken,state})),/Invalid/)
  await assert.rejects(()=>nativeConnectionBootstrap(request({url:url.toString(),browserToken:'d'.repeat(64),state})),/different session/)
  const expanded=new URL(url);expanded.searchParams.set('scope','extra-permissions')
  await assert.rejects(()=>nativeConnectionBootstrap(request({url:expanded.toString(),browserToken,state})),/different session/)
  const prepared=await nativeConnectionBootstrap(request({url:url.toString(),browserToken,state}));const payload=await prepared.json() as {url:string}
  const start=nativeConnectionStart(new Request(payload.url));assert.equal(start.headers.get('location'),url.toString());assert.match(start.headers.get('set-cookie')!,/planner-oauth=/)
  const cookie=start.headers.getSetCookie().find(v=>v.startsWith('planner-native-return='))!.split(';')[0]
  const callback=nativeConnectionReturn(new Request('https://aiplanner-ten.vercel.app/api/agent/oauth/callback/google?state='+oauthState,{headers:{cookie}}),'connected')!
  const result=new URL(callback.headers.get('location')!);assert.equal(result.host,'connection');assert.equal(result.searchParams.get('state'),state);assert.equal(result.searchParams.get('status'),'connected');assert(!result.toString().includes(browserToken))
  assert.equal(nativeConnectionReturn(new Request('https://aiplanner-ten.vercel.app/api/agent/oauth/callback/google?state=other',{headers:{cookie}}),'connected'),null)
 }finally{globalThis.fetch=original}
})
