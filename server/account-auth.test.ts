import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPair,SignJWT} from 'jose'
import {normalizeEmail,verifyGoogleIdentity,passwordAccount,handleAccountAuth} from './account-auth.js'
import {hashPassword,tokenHash} from './auth.js'
test('Google identity requires a signed, intended, verified identity and matching nonce',async()=>{
 process.env.GOOGLE_CLIENT_ID='planner-test'
 const {privateKey,publicKey}=await generateKeyPair('RS256')
 const sign=(overrides:Record<string,unknown>={})=>new SignJWT({email:'Arin@Example.com',email_verified:true,nonce:'nonce',sub:'google-arin',iss:'https://accounts.google.com',aud:'planner-test',exp:Math.floor(Date.now()/1000)+300,...overrides}).setProtectedHeader({alg:'RS256'}).sign(privateKey)
 assert.deepEqual(await verifyGoogleIdentity(await sign(),'nonce',async()=>publicKey),{google_sub:'google-arin',email:'arin@example.com'})
 await assert.rejects(()=>verifyGoogleIdentity(sign as unknown as string,'nonce',async()=>publicKey))
 for(const change of [{email_verified:false},{nonce:'other'},{aud:'another-client'},{iss:'https://attacker.test'},{exp:1}]){
  await assert.rejects(async()=>verifyGoogleIdentity(await sign(change),'nonce',async()=>publicKey))
 }
 assert.equal(normalizeEmail('  Arin@Example.COM '),'arin@example.com')
 assert.equal(normalizeEmail('arin'),null)
})
test('email and original username authenticate the same existing account; unverified Google email cannot take it over',async()=>{
 process.env.SUPABASE_URL='https://account-auth.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 const originalFetch=globalThis.fetch,password_hash=hashPassword('test-password-only'),token='a'.repeat(64)
 let consumed=false,linked=false,session=false
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1)
  if(table==='planner_accounts'){
   assert(request.method==='GET','Existing accounts must not be rewritten')
   if(url.searchParams.has('email'))assert.equal(url.searchParams.get('email'),'eq.arin@example.com')
   else assert.equal(url.searchParams.get('username'),'eq.arin')
   return Response.json({username:'arin',password_hash,email:'arin@example.com',email_verified:false})
  }
  if(table==='planner_login_tickets'){
   assert.equal(url.searchParams.get('token_hash'),'eq.'+tokenHash(token))
   assert(url.searchParams.has('expires_at'))
   if(request.method==='DELETE'){if(consumed)return new Response(null,{status:406});consumed=true;return Response.json({token_hash:tokenHash(token)})}
   return Response.json({token_hash:tokenHash(token),google_sub:'google-arin',email:'arin@example.com'})
  }
  if(table==='planner_google_logins'){
   if(request.method==='POST'){assert(consumed);assert.equal((await request.json() as {username:string}).username,'arin');linked=true;return new Response(null,{status:201})}
   return Response.json(linked?{username:'arin'}:null)
  }
  if(table==='planner_sessions'){session=true;assert.equal((await request.json() as {username:string}).username,'arin');return new Response(null,{status:201})}
  // Wake requests are unrelated to identity and may be retried.
  return Response.json(null)
 }
 const req=(action:string,data:unknown={})=>new Request('https://aiplanner-ten.vercel.app/api/auth/google/'+action,{method:'POST',headers:{cookie:'planner-account-ticket='+token,origin:'https://aiplanner-ten.vercel.app'},body:JSON.stringify(data)})
 try{
  assert.equal((await passwordAccount('arin','test-password-only'))?.username,'arin')
  assert.equal((await passwordAccount('arin@example.com','test-password-only'))?.username,'arin')
  assert.equal(await passwordAccount('arin','wrong'),null)
  const pending=await handleAccountAuth(req('finish'),'/api/auth/google/finish')
  assert.equal((await pending!.json() as {pending:boolean}).pending,true);assert(!consumed&&!linked&&!session)
  await assert.rejects(()=>handleAccountAuth(req('link',{identifier:'arin',password:'wrong'}),'/api/auth/google/link'))
  assert(!consumed&&!linked)
  const response=await handleAccountAuth(req('link',{identifier:'arin',password:'test-password-only'}),'/api/auth/google/link')
  const result=await response!.json() as {username:string;token:string};assert.equal(result.username,'arin');assert.match(result.token,/^[a-f0-9]{64}$/)
  assert(linked&&session);assert.match(response!.headers.get('set-cookie')!,/HttpOnly; Secure; SameSite=Lax/)
  await assert.rejects(()=>handleAccountAuth(req('finish'),'/api/auth/google/finish'))
  const foreign=req('finish');foreign.headers.set('origin','https://attacker.test')
  await assert.rejects(()=>handleAccountAuth(foreign,'/api/auth/google/finish'))
 }finally{globalThis.fetch=originalFetch}
})
