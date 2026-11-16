import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import {ApiError,db,json} from './cloud.js'
import {storage} from './mcp-auth.js'
import {sealVmCredential,openVmCredential} from './vm-vault.js'

const API='https://api.prod.whoop.com/developer/v2'
const AUTH='https://api.prod.whoop.com/oauth/oauth2/'
export const WHOOP_SCOPES='offline read:profile read:sleep read:recovery read:cycles read:workout read:body_measurement'
const origin=()=>process.env.APP_ORIGIN||'https://aiplanner-ten.vercel.app'
const sha=(value:string)=>createHash('sha256').update(value).digest('hex')
const callback=()=>origin()+'/api/whoop/callback'
const uuid=z.string().uuid()
export const whoopEventSchema=z.object({user_id:z.number().int().positive().safe(),id:uuid,type:z.enum(['sleep.updated','sleep.deleted','recovery.updated','recovery.deleted','workout.updated','workout.deleted']),trace_id:z.string().min(1).max(200)})
type WhoopEvent=z.infer<typeof whoopEventSchema>
type Tokens={access_token:string;refresh_token:string;expires_at:number;scope:string}
type Connection={username:string;whoop_user_id:number;credentials:string;connected_at:string;refresh_lease_until:string|null}
const tokensSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive(),scope:z.string()})
const identitySchema=z.object({user_id:z.number().int().positive().safe()})
const date=z.string().datetime({offset:true})
const scoreState=z.enum(['SCORED','PENDING_SCORE','UNSCORABLE'])
const sleepSchema=z.object({id:uuid,user_id:z.number().int().positive().safe(),cycle_id:z.number().int().positive().safe(),updated_at:date,start:date,end:date,timezone_offset:z.string().regex(/^(Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/),nap:z.boolean(),score_state:scoreState,score:z.object({stage_summary:z.object({total_light_sleep_time_milli:z.number().nonnegative(),total_slow_wave_sleep_time_milli:z.number().nonnegative(),total_rem_sleep_time_milli:z.number().nonnegative()})}).nullish()})
const recoverySchema=z.object({user_id:z.number().int().positive().safe(),sleep_id:uuid,cycle_id:z.number().int().positive().safe(),updated_at:date,score_state:scoreState,score:z.object({recovery_score:z.number().min(0).max(100)}).nullish()})
export function normalizedSleep(input:unknown,userId:number,id?:string){
 const s=sleepSchema.parse(input)
 if(s.user_id!==userId||(id&&s.id!==id)||Date.parse(s.end)<=Date.parse(s.start))throw new ApiError(502,'WHOOP returned an unexpected sleep record.')
 const stages=s.score?.stage_summary
 const actualSleepMinutes=s.score_state==='SCORED'&&stages?(stages.total_light_sleep_time_milli+stages.total_slow_wave_sleep_time_milli+stages.total_rem_sleep_time_milli)/60000:null
 if(actualSleepMinutes!==null&&actualSleepMinutes>(Date.parse(s.end)-Date.parse(s.start))/60000+1)throw new ApiError(502,'WHOOP returned inconsistent sleep durations.')
 return {id:s.id,cycleId:s.cycle_id,updatedAt:s.updated_at,data:{sleepStart:s.start,sleepEnd:s.end,timezoneOffset:s.timezone_offset,nap:s.nap,scoreState:s.score_state,actualSleepMinutes,record:input,sourceUrl:API+'/activity/sleep/'+s.id}}
}
export function normalizedRecovery(input:unknown,userId:number,sleepId:string){
 const r=recoverySchema.parse(input)
 if(r.user_id!==userId||r.sleep_id!==sleepId)throw new ApiError(502,'WHOOP returned an unexpected recovery record.')
 return {id:sleepId,updatedAt:r.updated_at,data:{scoreState:r.score_state,recoveryScore:r.score_state==='SCORED'?r.score?.recovery_score??null:null,record:input,sourceUrl:API+'/cycle/'+r.cycle_id+'/recovery'}}
}
export function normalizedWorkout(input:unknown,userId:number,id?:string){
 const w=z.object({id:uuid,user_id:z.number().int().positive().safe(),updated_at:date,start:date,end:date,score_state:scoreState}).parse(input)
 if(w.user_id!==userId||(id&&w.id!==id)||Date.parse(w.end)<=Date.parse(w.start))throw new ApiError(502,'WHOOP returned an unexpected workout record.')
 return {id:w.id,updatedAt:w.updated_at,data:{workoutStart:w.start,workoutEnd:w.end,scoreState:w.score_state,record:input,sourceUrl:API+'/activity/workout/'+w.id}}
}
function semanticRecord(value:unknown):unknown{
 if(Array.isArray(value))return value.map(semanticRecord)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['updated_at','created_at'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,semanticRecord(item)]))
 return value
}
function verifyOwnData(data:unknown,userId:number,body=false){
 if(data===null)return
 const object=z.record(z.string(),z.unknown()).parse(data)
 const records=Array.isArray(object.records)?object.records:[object]
 for(const value of records){const record=z.record(z.string(),z.unknown()).parse(value);if(!body&&record.user_id!==userId)throw new ApiError(502,'WHOOP returned data for an unexpected account.')}
}
export const whoopApiReadSchema=z.object({kind:z.enum(['profile','body','cycles','workouts','sleep','recovery']),id:z.string().max(100).optional(),start:date.optional(),end:date.optional(),nextToken:z.string().max(2000).optional(),limit:z.number().int().min(1).max(25).default(25)}).strict()
export async function readWhoopApi(username:string,input:unknown){
 const args=whoopApiReadSchema.parse(input),c=await connection(username);if(!c)throw new ApiError(409,'Connect WHOOP first.')
 if(args.start&&args.end&&Date.parse(args.start)>=Date.parse(args.end))throw new ApiError(400,'Choose a chronological WHOOP date range.')
 const paths={profile:'/user/profile/basic',body:'/user/measurement/body',cycles:'/cycle',workouts:'/activity/workout',sleep:'/activity/sleep',recovery:'/recovery'}
 let path=paths[args.kind]
 if(args.id){
  if(args.kind==='profile'||args.kind==='body')throw new ApiError(400,'Profile and body reads always use your own account.')
  if(args.kind==='cycles'||args.kind==='recovery'){if(!/^[1-9][0-9]{0,15}$/.test(args.id)||!Number.isSafeInteger(Number(args.id)))throw new ApiError(400,'Choose a valid WHOOP cycle ID.');path='/cycle/'+args.id+(args.kind==='recovery'?'/recovery':'')}
  else path+='/'+uuid.parse(args.id)
 }else if(!['profile','body'].includes(args.kind)){
  const params=new URLSearchParams({limit:String(args.limit)})
  if(args.start)params.set('start',args.start);if(args.end)params.set('end',args.end);if(args.nextToken)params.set('nextToken',args.nextToken)
  path+='?'+params
 }
 const data=await get(c,path,true)
 verifyOwnData(data,c.whoop_user_id,args.kind==='body')
 return {kind:args.kind,sourceUrl:API+path,data,available:data!==null,note:'All provider-returned fields are preserved. Follow next_token with nextToken to retrieve the next page; one response is not complete history.'}
}
async function syncWorkout(c:Connection,id:string,eventType:string,deadline:number){
 const raw=await get(c,'/activity/workout/'+uuid.parse(id),true,deadline)
 if(raw){const w=normalizedWorkout(raw,c.whoop_user_id,id);await store(c,'workout',w.id,w.data,w.updatedAt)}
 else if(eventType==='workout.deleted')await store(c,'workout',id,{deleted:true},new Date().toISOString())
 else throw new ApiError(503,'WHOOP is still making this workout available.')
}
async function syncOverview(c:Connection,deadline:number){
 const snapshot:Record<string,unknown>={}
 for(const [kind,path] of Object.entries({profile:'/user/profile/basic',body:'/user/measurement/body',cycles:'/cycle?limit=5'})){
  const data=await get(c,path,true,deadline)
  verifyOwnData(data,c.whoop_user_id,kind==='body')
  snapshot[kind]={sourceUrl:API+path,data}
 }
 const page=z.object({records:z.array(z.unknown())}).parse(await get(c,'/activity/workout?limit=5&start='+encodeURIComponent(new Date(Date.now()-7*86400000).toISOString()),false,deadline))
 for(const raw of page.records){const w=normalizedWorkout(raw,c.whoop_user_id);await store(c,'workout',w.id,w.data,w.updatedAt)}
 storage(await db().from('planner_whoop_connections').update({snapshot,snapshot_at:new Date().toISOString()}).eq('username',c.username).eq('connected_at',c.connected_at))
}
export function verifyWhoopSignature(raw:string,signature:string,timestamp:string,secret:string,now=Date.now()){
 if(!secret||!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300000||!signature)return false
 const actual=Buffer.from(signature,'base64'),expected=createHmac('sha256',secret).update(timestamp+raw).digest()
 return actual.length===expected.length&&timingSafeEqual(actual,expected)
}
function configured(){return !!(process.env.WHOOP_CLIENT_ID&&process.env.WHOOP_CLIENT_SECRET&&/^[0-9a-f]{64}$/i.test(process.env.CONNECTION_ENCRYPTION_KEY||''))}
function requireConfig(){if(!configured())throw new ApiError(503,'WHOOP OAuth needs a registered developer app. Configure WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET on Vercel first.')}
async function connection(username:string):Promise<Connection|null>{return storage(await db().from('planner_whoop_connections').select('username,whoop_user_id,credentials,connected_at,refresh_lease_until').eq('username',username).maybeSingle())}
export async function whoopStatus(username:string){
 const row=storage(await db().from('planner_whoop_connections').select('connected_at,last_synced_at,last_webhook_at,last_error,granted_scopes').eq('username',username).maybeSingle())
 return {configured:configured(),connected:!!row,needsReconnect:row?.last_error==='reconnect'||!!(row?.granted_scopes&&WHOOP_SCOPES.split(' ').some(scope=>!row.granted_scopes.split(' ').includes(scope))),connectedAt:row?.connected_at||null,lastSyncedAt:row?.last_synced_at||null,lastWebhookAt:row?.last_webhook_at||null,error:row?.last_error==='reconnect'?'Reconnect WHOOP to renew access.':row?.last_error?'WHOOP sync needs another attempt.':null,delivery:'webhook',execution:'Updates are received in the cloud. ChatGPT relay reviews require Planner open; no remote computer is started.'}
}
function apiTimeout(deadline:number,max:number){const remaining=deadline-Date.now();if(remaining<=0)throw new ApiError(503,'WHOOP background check will retry.');return AbortSignal.timeout(Math.max(1,Math.min(max,remaining)))}
async function tokenRequest(form:URLSearchParams,deadline=Date.now()+15000){
 requireConfig();form.set('client_id',process.env.WHOOP_CLIENT_ID!);form.set('client_secret',process.env.WHOOP_CLIENT_SECRET!)
 const r=await fetch(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:apiTimeout(deadline,12000)})
 if(!r.ok)throw new ApiError(r.status===400||r.status===401?401:502,'WHOOP authorization could not be renewed. Reconnect WHOOP if this persists.')
 const t=tokensSchema.parse(await r.json())
 if(WHOOP_SCOPES.split(' ').some(scope=>!t.scope.split(' ').includes(scope)))throw new ApiError(400,'WHOOP did not grant all requested read permissions. Reconnect and approve all requested WHOOP read permissions.')
 return {access_token:t.access_token,refresh_token:t.refresh_token,scope:t.scope,expires_at:Date.now()+t.expires_in*1000}
}
async function access(c:Connection,force=false,deadline=Date.now()+20000):Promise<Tokens>{
 const t=openVmCredential(c.credentials) as unknown as Tokens
 if(!force&&t.expires_at>Date.now()+60000)return t
 const leaseUntil=new Date(Date.now()+20000).toISOString()
 const leased=storage(await db().from('planner_whoop_connections').update({refresh_lease_until:leaseUntil}).eq('username',c.username).eq('connected_at',c.connected_at).or('refresh_lease_until.is.null,refresh_lease_until.lt.'+new Date().toISOString()).select('credentials').maybeSingle())
 if(!leased)throw new ApiError(503,'WHOOP is refreshing access. This check will retry quietly.')
 try{
  const latest=openVmCredential(leased.credentials) as unknown as Tokens
  if(latest.expires_at>Date.now()+60000&&(!force||latest.access_token!==t.access_token))return latest
  const fresh=await tokenRequest(new URLSearchParams({grant_type:'refresh_token',refresh_token:latest.refresh_token,scope:'offline'}),deadline)
  const saved=storage(await db().from('planner_whoop_connections').update({credentials:sealVmCredential(fresh),last_error:null}).eq('username',c.username).eq('connected_at',c.connected_at).select('username').maybeSingle())
  if(!saved)throw new ApiError(409,'WHOOP connection changed during refresh.')
  return fresh
 }catch(e){if(e instanceof ApiError&&e.status===401)storage(await db().from('planner_whoop_connections').update({last_error:'reconnect'}).eq('username',c.username).eq('connected_at',c.connected_at));throw e}
 finally{storage(await db().from('planner_whoop_connections').update({refresh_lease_until:null}).eq('username',c.username).eq('connected_at',c.connected_at).eq('refresh_lease_until',leaseUntil))}
}
async function get(c:Connection,path:string,missing=false,deadline=Date.now()+35000){
 let t=await access(c,false,deadline)
 const run=()=>fetch(API+path,{headers:{Authorization:'Bearer '+t.access_token},signal:apiTimeout(deadline,10000)})
 let r=await run();if(r.status===401){t=await access(c,true,deadline);r=await run()}
 if(missing&&r.status===404)return null
 if(!r.ok)throw new ApiError(502,'WHOOP data is temporarily unavailable. The background check will retry.')
 return r.json()
}
async function store(c:Connection,kind:'sleep'|'recovery'|'workout',id:string,data:Record<string,unknown>,updatedAt:string){
 return storage(await db().rpc('planner_store_whoop_record',{p_username:c.username,p_connection_at:c.connected_at,p_kind:kind,p_id:id,p_data:data,p_fingerprint:sha(JSON.stringify({...data,...(data.record?{record:semanticRecord(data.record)}:{})})),p_provider_updated_at:updatedAt}))
}
export async function syncWhoop(username:string,sleepId?:string,eventType?:string,deadline=Date.now()+35000){
 const c=await connection(username);if(!c)throw new ApiError(409,'Connect WHOOP first.')
 if(eventType?.startsWith('workout.')&&sleepId){await syncWorkout(c,sleepId,eventType,deadline);storage(await db().from('planner_whoop_connections').update({last_synced_at:new Date().toISOString(),last_error:null}).eq('username',username).eq('connected_at',c.connected_at));return readWhoopData(username)}
 let sleeps:unknown[]
 if(sleepId){const s=await get(c,'/activity/sleep/'+uuid.parse(sleepId),true,deadline);sleeps=s?[s]:[]}
 else{const page=z.object({records:z.array(z.unknown())}).parse(await get(c,'/activity/sleep?limit=2&start='+encodeURIComponent(new Date(Date.now()-3*86400000).toISOString()),false,deadline));sleeps=page.records}
 if(sleepId&&!sleeps.length){
  // Fetch current state even for delete notifications: late or reordered deliveries must not delete a live record.
  if(!eventType?.endsWith('.deleted'))throw new ApiError(503,'WHOOP is still making this sleep record available.')
  const stamp=new Date().toISOString();await store(c,'sleep',sleepId,{deleted:true},stamp);await store(c,'recovery',sleepId,{deleted:true},stamp)
 }
 for(const item of sleeps){
  const s=normalizedSleep(item,c.whoop_user_id,sleepId);await store(c,'sleep',s.id,s.data,s.updatedAt)
  const raw=await get(c,'/cycle/'+s.cycleId+'/recovery',true,deadline)
  if(raw){const r=normalizedRecovery(raw,c.whoop_user_id,s.id);await store(c,'recovery',r.id,{...r.data,sleepEnd:s.data.sleepEnd},r.updatedAt)}
  else if(eventType==='recovery.deleted')await store(c,'recovery',s.id,{deleted:true},new Date().toISOString())
 }
 if(!sleepId)await syncOverview(c,deadline)
 storage(await db().from('planner_whoop_connections').update({last_synced_at:new Date().toISOString(),last_error:null}).eq('username',username).eq('connected_at',c.connected_at))
 return readWhoopData(username)
}
export async function readWhoopData(username:string){
 const [status,records,overview]=await Promise.all([whoopStatus(username),db().from('planner_whoop_records').select('kind,object_id,data,observed_at').eq('username',username).order('observed_at',{ascending:false}).limit(20),db().from('planner_whoop_connections').select('snapshot,snapshot_at').eq('username',username).maybeSingle()])
 return {...status,records:storage(records),overview:storage(overview),historyTool:'planner_whoop_api_read provides all fields and paginated history for every authorized API category.',note:'API sleep start/end are recorded sleep bounds; actualSleepMinutes is the sum of sleep stages, not time in bed. timezoneOffset is the recorded numeric offset, not an IANA timezone. Pending scores and deleted records are not evidence of current sleep or wakefulness.'}
}
export async function startWhoop(username:string,nativeState?:unknown){
 const returnState=nativeState===undefined?undefined:z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).parse(nativeState)
 requireConfig()
 const state=randomBytes(24).toString('hex'),browser=randomBytes(24).toString('hex'),expires=Date.now()+600000
 storage(await db().from('planner_whoop_oauth_attempts').delete().lt('expires_at',new Date().toISOString()))
 storage(await db().from('planner_whoop_oauth_attempts').insert({username,state_hash:sha(state),browser_hash:sha(browser),expires_at:new Date(expires).toISOString()}))
 // An encrypted, short-lived handoff sets the binding cookie in the actual OAuth browser, including Safari on iPhone.
 const ticket=sealVmCredential({kind:'whoop-oauth',state,browser,expires,returnState})
 return {url:origin()+'/api/whoop/authorize?ticket='+encodeURIComponent(ticket)+(returnState?'&nativeState='+encodeURIComponent(returnState):'')}
}
async function authorize(request:Request){
 requireConfig();let handoff:{kind:string;state:string;browser:string;expires:number;returnState?:string}
 try{handoff=openVmCredential(new URL(request.url).searchParams.get('ticket')||'') as unknown as typeof handoff}catch{throw new ApiError(400,'WHOOP connection expired. Start again from Planner.')}
 if(handoff.kind!=='whoop-oauth'||handoff.expires<Date.now())throw new ApiError(400,'WHOOP connection expired. Start again from Planner.')
 const attempt=storage(await db().from('planner_whoop_oauth_attempts').select('browser_hash').eq('state_hash',sha(handoff.state)).gt('expires_at',new Date().toISOString()).maybeSingle())
 if(!attempt||attempt.browser_hash!==sha(handoff.browser))throw new ApiError(400,'WHOOP connection expired. Start again from Planner.')
 const url=new URL(AUTH+'auth');url.search=new URLSearchParams({client_id:process.env.WHOOP_CLIENT_ID!,redirect_uri:callback(),response_type:'code',scope:WHOOP_SCOPES,state:handoff.state}).toString()
 const headers=new Headers({Location:url.toString(),'Set-Cookie':`planner-whoop=${handoff.browser}; HttpOnly; Secure; SameSite=Lax; Path=/api/whoop; Max-Age=600`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
 if(!handoff.returnState)headers.append('Set-Cookie','planner-whoop-return=; HttpOnly; Secure; SameSite=Lax; Path=/api/whoop; Max-Age=0')
 if(handoff.returnState)headers.append('Set-Cookie',`planner-whoop-return=${sealVmCredential({state:handoff.state,browser:handoff.browser,returnState:handoff.returnState,expires:handoff.expires})}; HttpOnly; Secure; SameSite=Lax; Path=/api/whoop; Max-Age=600`)
 return new Response(null,{status:303,headers})
}
async function oauthCallback(request:Request){
 requireConfig();const deadline=Date.now()+45000;const url=new URL(request.url),state=url.searchParams.get('state')||'',browser=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('planner-whoop='))?.slice('planner-whoop='.length)||''
 if(!state||!browser)throw new ApiError(400,'WHOOP connection could not be verified. Start again from Planner.')
 const attempt=storage(await db().from('planner_whoop_oauth_attempts').delete().eq('state_hash',sha(state)).eq('browser_hash',sha(browser)).gt('expires_at',new Date().toISOString()).select('username').maybeSingle())
 if(!attempt)throw new ApiError(400,'WHOOP connection expired or was already completed.')
 let nativeState:string|undefined
 const returnCookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('planner-whoop-return='))?.slice('planner-whoop-return='.length)
 if(returnCookie){
  const saved=openVmCredential(returnCookie) as unknown as {state:string;browser:string;returnState:string;expires:number}
  if(saved.state!==state||saved.browser!==browser||saved.expires<Date.now()||! /^[A-Za-z0-9_-]{20,100}$/.test(saved.returnState))throw new ApiError(400,'WHOOP app return could not be verified. Start again from Planner.')
  nativeState=saved.returnState
 }
 const headers=new Headers({'Set-Cookie':'planner-whoop=; HttpOnly; Secure; SameSite=Lax; Path=/api/whoop; Max-Age=0','Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
 headers.append('Set-Cookie','planner-whoop-return=; HttpOnly; Secure; SameSite=Lax; Path=/api/whoop; Max-Age=0')
 const finish=(status:'connected'|'cancelled')=>{headers.set('Location',nativeState?'aiplanner://whoop?'+new URLSearchParams({status,state:nativeState}):origin()+'/?connection='+(status==='connected'?'whoop':'cancelled'));return new Response(null,{status:303,headers})}
 if(url.searchParams.has('error'))return finish('cancelled')
 const code=url.searchParams.get('code');if(!code)throw new ApiError(400,'WHOOP did not return an authorization code.')
 const tokens=await tokenRequest(new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback()}),deadline)
 const r=await fetch(API+'/user/profile/basic',{headers:{Authorization:'Bearer '+tokens.access_token},signal:apiTimeout(deadline,10000)})
 if(!r.ok)throw new ApiError(502,'WHOOP identity could not be verified.')
 const identity=identitySchema.parse(await r.json())
 storage(await db().rpc('planner_connect_whoop',{p_username:attempt.username,p_user_id:identity.user_id,p_credentials:sealVmCredential(tokens)}))
 storage(await db().from('planner_whoop_connections').update({granted_scopes:tokens.scope}).eq('username',attempt.username).eq('whoop_user_id',identity.user_id))
 // Initial sync is optional: the authorized connection survives a temporary provider outage.
 await syncWhoop(attempt.username,undefined,undefined,deadline).catch(async()=>{storage(await db().from('planner_whoop_connections').update({last_error:'sync'}).eq('username',attempt.username))})
 return finish('connected')
}
async function processEvent(event:WhoopEvent,username:string,deadline=Date.now()+35000){
 try{
  await syncWhoop(username,event.id,event.type,deadline)
  storage(await db().from('planner_whoop_events').update({processed_at:new Date().toISOString(),last_error:null}).eq('username',username).eq('trace_id',event.trace_id))
 }catch(e){storage(await db().from('planner_whoop_events').update({last_error:'retry'}).eq('username',username).eq('trace_id',event.trace_id));throw e}
}
export async function whoopWebhook(request:Request){
 requireConfig()
 const raw=await request.text();if(Buffer.byteLength(raw)>16384)throw new ApiError(413,'WHOOP notification is too large.')
 if(!verifyWhoopSignature(raw,request.headers.get('x-whoop-signature')||'',request.headers.get('x-whoop-signature-timestamp')||'',process.env.WHOOP_CLIENT_SECRET!))throw new ApiError(401,'Invalid WHOOP signature.')
 let parsed:unknown;try{parsed=JSON.parse(raw)}catch{throw new ApiError(400,'Invalid WHOOP notification.')}
 const event=whoopEventSchema.parse(parsed)
 const c=storage(await db().from('planner_whoop_connections').select('username').eq('whoop_user_id',event.user_id).maybeSingle())
 if(!c)return json({received:true})
 const insert=await db().from('planner_whoop_events').insert({trace_id:event.trace_id,username:c.username,event}).select('trace_id').single()
 if(insert.error?.code==='23505'){
  const saved=storage(await db().from('planner_whoop_events').select('processed_at,event').eq('username',c.username).eq('trace_id',event.trace_id).maybeSingle())
  if(!saved||saved.processed_at)return json({received:true})
  if(['user_id','id','type','trace_id'].some(key=>saved.event[key]!==event[key as keyof WhoopEvent]))throw new ApiError(400,'WHOOP notification identifier was reused.')
 }else storage(insert)
 storage(await db().from('planner_whoop_connections').update({last_webhook_at:new Date().toISOString()}).eq('username',c.username))
 await processEvent(event,c.username)
 return json({received:true})
}
export async function reconcileWhoop(){
 const deadline=Date.now()+45000
 const pending=storage(await db().from('planner_whoop_events').select('username,event').is('processed_at',null).order('created_at').limit(1))
 for(const row of pending)await processEvent(whoopEventSchema.parse(row.event),row.username,deadline).catch(()=>{})
 const connections=storage(await db().from('planner_whoop_connections').select('username').or('last_synced_at.is.null,last_synced_at.lt.'+new Date(Date.now()-20*3600000).toISOString()).order('last_synced_at',{nullsFirst:true}).limit(1))
 for(const c of connections)await syncWhoop(c.username,undefined,undefined,deadline).catch(()=>{})
 storage(await db().from('planner_whoop_events').delete().not('processed_at','is',null).lt('created_at',new Date(Date.now()-30*86400000).toISOString()))
 return {ok:true}
}
export async function disconnectWhoop(username:string){
 const c=await connection(username)
 if(c){
  const t=await access(c).catch(e=>{if(e instanceof ApiError&&e.status===401)return null;throw e})
  if(t){const r=await fetch(API+'/user/access',{method:'DELETE',headers:{Authorization:'Bearer '+t.access_token},signal:AbortSignal.timeout(10000)});if(!r.ok&&![401,403,404].includes(r.status))throw new ApiError(502,'WHOOP could not revoke access. Try disconnecting again.')}
  storage(await db().rpc('planner_disconnect_whoop',{p_username:username}))
 }
 return {disconnected:true}
}
export async function handleWhoopPublic(request:Request,path:string){
 if(path==='/api/whoop/authorize'&&request.method==='GET')return authorize(request)
 if(path==='/api/whoop/callback'&&request.method==='GET')return oauthCallback(request)
 if(path==='/api/whoop/webhook'&&request.method==='POST')return whoopWebhook(request)
 if(path==='/api/whoop/reconcile'&&request.method==='GET'){
  const secret=process.env.CRON_SECRET||''
  if(!secret||request.headers.get('authorization')!=='Bearer '+secret)throw new ApiError(401,'Unauthorized.')
  if(!configured())return json({ok:true,configured:false})
  return json(await reconcileWhoop())
 }
 throw new ApiError(405,'Unsupported WHOOP request.')
}
