import {randomBytes,createHash,timingSafeEqual} from 'node:crypto'
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose'
import {ApiError,body,db,json,sessionToken} from './cloud.js'
import {hashPassword,verifyPassword,normalizeUsername,createToken,tokenHash} from './auth.js'
import {sealVmCredential,openVmCredential} from './vm-vault.js'
import {DEFAULT_CALENDAR,EMPTY_FILES} from './defaults.js'
import {queuePersonalVm,touchVmActivity} from './vm-host.js'
const ORIGIN=process.env.APP_ORIGIN||'https://aiplanner-ten.vercel.app'
const CALLBACK='/api/agent/oauth/callback/google'
const STATE_COOKIE='planner-account-oauth',TICKET_COOKIE='planner-account-ticket'
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
export function normalizeEmail(value:unknown){if(typeof value!=='string')return null;const email=value.trim().toLowerCase();return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null}
function check<T>(response:{data:T;error:{code?:string}|null}):T{if(response.error)throw new ApiError(response.error.code==='23505'?409:503,response.error.code==='23505'?'That email or username is already in use. Sign in or link your existing account.':'Could not access sign-in storage. Please try again.');return response.data}
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1)||''}
function setCookie(response:Response,name:string,value:string,seconds:number,path='/api/auth'){response.headers.append('Set-Cookie',`${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=${path}; Max-Age=${seconds}`);return response}
function sameOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==ORIGIN&&origin!==new URL(request.url).origin)throw new ApiError(403,'Start sign-in from AI Planner.')}
function generatedUsername(email:string){const base=email.split('@')[0].replace(/[^a-z0-9_]/g,'').slice(0,16)||'user';return base+'_'+randomBytes(3).toString('hex')}
export async function passwordAccount(identifier:string,password:string){
 const email=normalizeEmail(identifier),username=normalizeUsername(identifier)
 if((!email&&!username)||!password||password.length>256)return null
 const account=check(await db().from('planner_accounts').select('username,password_hash,email,email_verified').eq(email?'email':'username',email||username!).maybeSingle())
 return account&&verifyPassword(password,account.password_hash)?account:null
}
export async function createLoginAccount(username:string,password:string,email:string|null,verified=false,googleSub:string|null=null){
 check(await db().rpc('planner_create_login_account',{p_username:username,p_password_hash:hashPassword(password),p_email:email,p_email_verified:verified,p_google_sub:googleSub,p_calendar:DEFAULT_CALENDAR,p_files:EMPTY_FILES}))
 await queuePersonalVm(username).catch(()=>console.error('New account agent setup will retry.'))
 return username
}
export async function verifyGoogleIdentity(token:string,nonce:string,key:JWTVerifyGetKey=jwks){
 const {payload}=await jwtVerify(token,key,{audience:process.env.GOOGLE_CLIENT_ID,issuer:['https://accounts.google.com','accounts.google.com']})
 if(!process.env.GOOGLE_CLIENT_ID||payload.nonce!==nonce||payload.email_verified!==true||typeof payload.sub!=='string'||!payload.sub||!normalizeEmail(payload.email))throw new ApiError(401,'Google identity could not be verified.')
 return {google_sub:payload.sub,email:normalizeEmail(payload.email)!}
}
async function pending(request:Request){const token=cookie(request,TICKET_COOKIE);if(!/^[0-9a-f]{64}$/.test(token))throw new ApiError(401,'Google sign-in expired. Please start again.');const ticket=check(await db().from('planner_login_tickets').select('token_hash,google_sub,email').eq('token_hash',tokenHash(token)).gt('expires_at',new Date().toISOString()).maybeSingle());if(!ticket)throw new ApiError(401,'Google sign-in expired. Please start again.');return ticket}
async function consume(ticket:{token_hash:string}){const claimed=check(await db().from('planner_login_tickets').delete().eq('token_hash',ticket.token_hash).gt('expires_at',new Date().toISOString()).select('token_hash').maybeSingle());if(!claimed)throw new ApiError(409,'This sign-in was already completed. Please start again.')}
async function signedIn(username:string){await touchVmActivity(username).catch(()=>console.error('VM wake will retry after sign-in.'));return setCookie(json({username,token:await sessionToken(username)}),TICKET_COOKIE,'',0)}
async function complete(request:Request,action:string){
 sameOrigin(request);const ticket=await pending(request)
 const linked=check(await db().from('planner_google_logins').select('username').eq('google_sub',ticket.google_sub).maybeSingle())
 if(linked){if(action==='link')throw new ApiError(409,'This Google account is already linked. Use Continue with Google to sign in.');await consume(ticket);return signedIn(linked.username)}
 const accountWithEmail=check(await db().from('planner_accounts').select('username,email_verified').eq('email',ticket.email).maybeSingle())
 // Only a previously verified email may be automatically linked; never trust
 // an email typed into registration as proof of Google account ownership.
 if(accountWithEmail?.email_verified){await consume(ticket);check(await db().from('planner_google_logins').insert({google_sub:ticket.google_sub,email:ticket.email,username:accountWithEmail.username}));return signedIn(accountWithEmail.username)}
 if(action==='finish')return json({pending:true,email:ticket.email,existingAccount:Boolean(accountWithEmail)})
 if(action==='link'){
  const input=await body(request),account=await passwordAccount(typeof input.identifier==='string'?input.identifier:'',typeof input.password==='string'?input.password:'')
  if(!account)throw new ApiError(401,'Wrong email/username or password.')
  await consume(ticket)
  check(await db().from('planner_google_logins').insert({google_sub:ticket.google_sub,email:ticket.email,username:account.username}))
  if(!account.email&&!accountWithEmail)check(await db().from('planner_accounts').update({email:ticket.email,email_verified:true}).eq('username',account.username).is('email',null))
  return signedIn(account.username)
 }
 if(action==='create'){
  if(accountWithEmail)throw new ApiError(409,'That email already has an account. Link it using its existing password.')
  await consume(ticket)
  const username=generatedUsername(ticket.email)
  await createLoginAccount(username,randomBytes(32).toString('hex'),ticket.email,true,ticket.google_sub)
  return signedIn(username)
 }
 throw new ApiError(400,'Choose a sign-in action.')
}
async function start(request:Request){
 sameOrigin(request)
 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)throw new ApiError(503,'Google sign-in is not configured yet.')
 const state='login_'+randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url'),nonce=randomBytes(24).toString('hex')
 const sealed=sealVmCredential({kind:'planner-google-login',state,verifier,nonce,expiresAt:Date.now()+600000})
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
 url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:ORIGIN+CALLBACK,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString()
 return setCookie(json({url:url.toString()}),STATE_COOKIE,sealed,600,CALLBACK)
}
async function callback(request:Request){
 const url=new URL(request.url)
 const response=(status:string)=>setCookie(new Response(null,{status:303,headers:{Location:ORIGIN+'/?google_login='+status,'Cache-Control':'no-store'}}),STATE_COOKIE,'',0,CALLBACK)
 try{
  const attempt=openVmCredential(cookie(request,STATE_COOKIE)) as unknown as {kind:string;state:string;verifier:string;nonce:string;expiresAt:number}
  const state=url.searchParams.get('state')||''
  if(attempt.kind!=='planner-google-login'||attempt.expiresAt<=Date.now()||state.length!==attempt.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(attempt.state)))throw new Error('Invalid login state')
  if(url.searchParams.get('error'))return response('cancelled')
  const code=url.searchParams.get('code');if(!code)throw new Error('Missing authorization code')
  const tokens=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:ORIGIN+CALLBACK,code_verifier:attempt.verifier}),signal:AbortSignal.timeout(15000)})
  if(!tokens.ok)throw new Error('Google exchange failed')
  const result=await tokens.json() as {id_token?:string};if(!result.id_token)throw new Error('Missing identity token')
  const identity=await verifyGoogleIdentity(result.id_token,attempt.nonce),ticket=createToken()
  check(await db().from('planner_login_tickets').delete().lt('expires_at',new Date().toISOString()))
  check(await db().from('planner_login_tickets').insert({token_hash:tokenHash(ticket),...identity,expires_at:new Date(Date.now()+600000).toISOString()}))
  return setCookie(response('success'),TICKET_COOKIE,ticket,600)
 }catch{console.error('Google account sign-in could not finish.');return response('failed')}
}
export async function handleAccountAuth(request:Request,path:string):Promise<Response|null>{
 const method=request.method
 if(path===CALLBACK&&new URL(request.url).searchParams.get('state')?.startsWith('login_'))return callback(request)
 if(path==='/api/auth/options'&&method==='GET')return json({googleEnabled:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.CONNECTION_ENCRYPTION_KEY),pendingGoogle:Boolean(cookie(request,TICKET_COOKIE))})
 if(path==='/api/auth/google/start'&&method==='POST')return start(request)
 if(path==='/api/auth/google/finish'&&method==='POST')return complete(request,'finish')
 if(path==='/api/auth/google/link'&&method==='POST')return complete(request,'link')
 if(path==='/api/auth/google/create'&&method==='POST')return complete(request,'create')
 return null
}
