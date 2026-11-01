import {createHash,timingSafeEqual} from 'node:crypto'
import {ApiError,body,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {sealVmCredential,openVmCredential} from './vm-vault.js'
import {tokenHash} from './auth.js'
const ORIGIN=process.env.APP_ORIGIN||'https://aiplanner-ten.vercel.app'
export type NativeContext={challenge:string;state:string}
export function nativeContext(url:URL):NativeContext {
 const challenge=url.searchParams.get('challenge')||'',state=url.searchParams.get('state')||''
 if(!/^[A-Za-z0-9_-]{43}$/.test(challenge)||!/^[A-Za-z0-9_-]{43}$/.test(state))throw new ApiError(400,'Invalid native sign-in request.')
 return {challenge,state}
}
export function nativeLoginResult(status:string,native:NativeContext,ticket?:string){
 const url=new URL('aiplanner://auth');url.searchParams.set('state',native.state);url.searchParams.set('status',status)
 if(ticket)url.searchParams.set('bridge',sealVmCredential({kind:'planner-native-login',ticket,challenge:native.challenge,expiresAt:Date.now()+120000}))
 return new Response(null,{status:303,headers:{Location:url.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
}
export async function redeemNativeLogin(request:Request){
 const input=await body(request)
 let bridge:{kind:string;ticket:string;challenge:string;expiresAt:number}
 try{bridge=openVmCredential(String(input.bridge||'')) as unknown as typeof bridge}catch{throw new ApiError(401,'Native sign-in expired. Start again.')}
 const verifier=typeof input.verifier==='string'?input.verifier:''
 const challenge=createHash('sha256').update(verifier).digest('base64url')
 if(bridge.kind!=='planner-native-login'||bridge.expiresAt<=Date.now()||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)||bridge.challenge.length!==challenge.length||!timingSafeEqual(Buffer.from(bridge.challenge),Buffer.from(challenge)))throw new ApiError(401,'Native sign-in could not be verified.')
 const ticket=storage(await db().from('planner_login_tickets').select('token_hash').eq('token_hash',tokenHash(bridge.ticket)).gt('expires_at',new Date().toISOString()).maybeSingle())
 if(!ticket)throw new ApiError(401,'Sign-in was already completed or expired.')
 const response=json({ready:true})
 response.headers.set('Set-Cookie',`planner-account-ticket=${bridge.ticket}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=120`)
 return response
}
function readCookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||''}
export async function nativeConnectionBootstrap(request:Request){
 const input=await body(request),url=new URL(String(input.url||'')),browserToken=String(input.browserToken||''),state=String(input.state||'')
 if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.searchParams.get('redirect_uri')!==ORIGIN+'/api/agent/oauth/callback/google'||!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[0-9a-f]{64}$/.test(browserToken))throw new ApiError(400,'Invalid native Google connection.')
 const attempt=storage(await db().from('planner_oauth_attempts').select('browser_hash,nonce,verifier,requested_scopes').eq('state_hash',tokenHash(url.searchParams.get('state')||'')).eq('provider','google').gt('expires_at',new Date().toISOString()).maybeSingle())
 if(!attempt||attempt.browser_hash!==tokenHash(browserToken)||url.searchParams.get('client_id')!==process.env.GOOGLE_CLIENT_ID||url.searchParams.get('nonce')!==attempt.nonce||url.searchParams.get('scope')!==attempt.requested_scopes||url.searchParams.get('code_challenge')!==createHash('sha256').update(attempt.verifier).digest('base64url')||url.searchParams.get('code_challenge_method')!=='S256')throw new ApiError(401,'This connection expired or belongs to a different session.')
 const token=sealVmCredential({kind:'native-google-connection',url:url.toString(),browserToken,state,expiresAt:Date.now()+600000})
 return json({url:ORIGIN+'/api/auth/native/connection/start?token='+encodeURIComponent(token)})
}
export function nativeConnectionStart(request:Request){
 let attempt:{kind:string;url:string;browserToken:string;state:string;expiresAt:number}
 try{attempt=openVmCredential(new URL(request.url).searchParams.get('token')||'') as unknown as typeof attempt}catch{throw new ApiError(401,'Connection expired. Start again.')}
 if(attempt.kind!=='native-google-connection'||attempt.expiresAt<=Date.now())throw new ApiError(401,'Connection expired. Start again.')
 const response=new Response(null,{status:303,headers:{Location:attempt.url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
 response.headers.append('Set-Cookie',`planner-oauth=${attempt.browserToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/agent/oauth; Max-Age=600`)
 response.headers.append('Set-Cookie',`planner-native-return=${sealVmCredential({kind:'native-return',state:attempt.state,oauthState:new URL(attempt.url).searchParams.get('state'),expiresAt:attempt.expiresAt})}; HttpOnly; Secure; SameSite=Lax; Path=/api/agent/oauth; Max-Age=600`)
 return response
}
export function nativeConnectionReturn(request:Request,status:string):Response|null{
 try{
  const context=openVmCredential(readCookie(request,'planner-native-return')) as unknown as {kind:string;state:string;oauthState:string;expiresAt:number}
  if(context.kind!=='native-return'||context.expiresAt<=Date.now()||context.oauthState!==new URL(request.url).searchParams.get('state'))return null
  const url=new URL('aiplanner://connection');url.searchParams.set('state',context.state);url.searchParams.set('status',status)
  const response=new Response(null,{status:303,headers:{Location:url.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
  response.headers.append('Set-Cookie','planner-native-return=; HttpOnly; Secure; SameSite=Lax; Path=/api/agent/oauth; Max-Age=0')
  response.headers.append('Set-Cookie','planner-oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/agent/oauth; Max-Age=0')
  return response
 }catch{return null}
}
