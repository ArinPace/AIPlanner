import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {verifyWhoopSignature,normalizedSleep,normalizedRecovery,whoopEventSchema,startWhoop,handleWhoopPublic,whoopWebhook,syncWhoop,WHOOP_SCOPES,disconnectWhoop,readWhoopApi,normalizedWorkout} from './whoop-api.js'
import {sealVmCredential,openVmCredential} from './vm-vault.js'
const id='11111111-1111-4111-8111-111111111111',stamp=new Date().toISOString()
const sleep={id,user_id:42,cycle_id:84,updated_at:stamp,start:new Date(Date.now()-9*3600000).toISOString(),end:new Date(Date.now()-3600000).toISOString(),timezone_offset:'-05:00',nap:false,score_state:'SCORED',score:{stage_summary:{total_light_sleep_time_milli:4*3600000,total_slow_wave_sleep_time_milli:3600000,total_rem_sleep_time_milli:2*3600000}}}
const workout={id,user_id:42,updated_at:stamp,start:sleep.start,end:sleep.end,score_state:'SCORED',sport_name:'Running',score:{strain:12,zone_duration:{zone_five_milli:60000}}}
const recovery={user_id:42,sleep_id:id,cycle_id:84,updated_at:stamp,score_state:'SCORED',score:{recovery_score:80,hrv_rmssd_milli:31.5,spo2_percentage:98}}
test('webhook signature uses raw body, constant-time digest and a bounded timestamp',()=>{
 const now=Date.now(),raw='{ "id": "fixture" }',ts=String(now),sign=(t:string,b:string)=>createHmac('sha256','fixture-secret').update(t+b).digest('base64')
 assert(verifyWhoopSignature(raw,sign(ts,raw),ts,'fixture-secret',now))
 assert(!verifyWhoopSignature(raw+' ',sign(ts,raw),ts,'fixture-secret',now))
 assert(!verifyWhoopSignature(raw,'bad',ts,'fixture-secret',now))
 assert(!verifyWhoopSignature(raw,sign(ts,raw),ts,'wrong',now))
 for(const t of [String(now-300001),String(now+300001),'bad'])assert(!verifyWhoopSignature(raw,sign(t,raw),t,'fixture-secret',now))
 assert(!whoopEventSchema.safeParse({user_id:42,id:17,type:'sleep.updated',trace_id:'test'}).success,'Legacy v1 IDs are rejected')
})
test('sleep boundaries, recorded offset, actual stage duration and recovery ownership stay distinct',()=>{
 const s=normalizedSleep(sleep,42,id);assert.equal(s.data.actualSleepMinutes,420);assert.equal(s.data.timezoneOffset,'-05:00');assert.equal(s.data.sleepEnd,sleep.end)
 assert.equal(normalizedSleep({...sleep,score_state:'PENDING_SCORE',score:null},42).data.actualSleepMinutes,null)
 assert.equal(normalizedRecovery(recovery,42,id).data.recoveryScore,80)
 assert.equal((normalizedSleep({...sleep,score:{...sleep.score,respiratory_rate:15}},42).data.record as any).score.respiratory_rate,15)
 assert.equal((normalizedWorkout(workout,42).data.record as any).sport_name,'Running')
 assert.throws(()=>normalizedWorkout(workout,99),/unexpected/)
 assert.equal(normalizedRecovery({...recovery,score_state:'PENDING_SCORE'},42,id).data.recoveryScore,null)
 assert.throws(()=>normalizedSleep(sleep,99),/unexpected/)
 assert.throws(()=>normalizedSleep({...sleep,end:sleep.start},42),/unexpected/)
 assert.throws(()=>normalizedRecovery({...recovery,sleep_id:'22222222-2222-4222-8222-222222222222'},42,id),/unexpected/)
 assert.throws(()=>normalizedSleep({...sleep,score:{stage_summary:{total_light_sleep_time_milli:99*3600000,total_slow_wave_sleep_time_milli:0,total_rem_sleep_time_milli:0}}},42),/inconsistent/)
})
test('OAuth handoff, owner-bound state, token rotation, retryable deliveries, deletion and unlink flow',async()=>{
 const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','WHOOP_CLIENT_ID','WHOOP_CLIENT_SECRET','CONNECTION_ENCRYPTION_KEY','CRON_SECRET'],prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 Object.assign(process.env,{SUPABASE_URL:'https://whoop.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',WHOOP_CLIENT_ID:'fixture-client',WHOOP_CLIENT_SECRET:'fixture-secret',CONNECTION_ENCRYPTION_KEY:'ab'.repeat(32),CRON_SECRET:'fixture-cron'});delete process.env.SUPABASE_SECRET_KEY
 let attempt:any=null,c:any=null,failApi=false,deleted=false,tokenCalls=0,leaseAvailable=true,providerCalls=0,stored=0,revoked=false
 const events=new Map<string,any>(),records:any[]=[]
 const fresh=()=>({access_token:'fixture-access-'+tokenCalls,refresh_token:'fixture-refresh-'+tokenCalls,expires_in:3600,scope:WHOOP_SCOPES})
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),u=new URL(req.url),name=u.pathname.split('/').at(-1),value=req.method==='POST'||req.method==='PATCH'?(await req.clone().json().catch(()=>null)) as any:null
  if(u.hostname==='api.prod.whoop.com'){
   providerCalls++
   if(u.pathname.endsWith('/token')){const form=new URLSearchParams(await req.text());assert.equal(form.get('client_secret'),'fixture-secret');tokenCalls++;return Response.json(fresh())}
   if(u.pathname.endsWith('/profile/basic'))return Response.json({user_id:42,first_name:'Fixture',email:'fixture@example.invalid'})
   if(u.pathname.endsWith('/measurement/body'))return Response.json({height_meter:1.8,weight_kilogram:70,max_heart_rate:190})
   if(u.pathname.endsWith('/recovery')&&!u.pathname.includes('/cycle/'))return Response.json({records:[recovery]})
   if(u.pathname.endsWith('/cycle'))return Response.json({records:[{id:84,user_id:42,step_count:1000,score:{strain:10}}],next_token:u.searchParams.has('nextToken')?null:'fixture-next'})
   if(u.pathname.includes('/activity/workout/'))return deleted?Response.json({}, {status:404}):Response.json(workout)
   if(u.pathname.endsWith('/activity/workout'))return Response.json({records:[workout]})
   if(u.pathname.endsWith('/user/access')){revoked=true;return new Response(null,{status:204})}
   if(failApi)return Response.json({}, {status:503})
   if(u.pathname.includes('/activity/sleep/'))return deleted?Response.json({}, {status:404}):Response.json(sleep)
   if(u.pathname.endsWith('/activity/sleep'))return Response.json({records:[sleep]})
   if(u.pathname.endsWith('/cycle/84/recovery'))return Response.json(recovery)
   throw Error('Unexpected WHOOP path '+u.pathname)
  }
  assert.equal(u.hostname,'whoop.test')
  if(name==='planner_whoop_oauth_attempts'){
   if(req.method==='POST'){attempt=value;assert.equal(value.username,'owner');assert(!JSON.stringify(value).includes('fixture-secret'));return new Response(null,{status:201})}
   if(req.method==='DELETE'&&!u.searchParams.has('state_hash'))return new Response(null,{status:204})
   const matches=attempt&&u.searchParams.get('state_hash')==='eq.'+attempt.state_hash&&(!u.searchParams.has('browser_hash')||u.searchParams.get('browser_hash')==='eq.'+attempt.browser_hash)
   if(req.method==='DELETE'){if(matches){attempt=null;return Response.json({username:'owner'})}return Response.json(null)}
   return Response.json(matches?{browser_hash:attempt.browser_hash}:null)
  }
  if(name==='planner_connect_whoop'){
   assert.equal(value.p_username,'owner');assert.equal(value.p_user_id,42)
   c={username:'owner',whoop_user_id:42,credentials:value.p_credentials,connected_at:stamp,refresh_lease_until:null,last_error:null};return Response.json(null)
  }
  if(name==='planner_disconnect_whoop'){assert.equal(value.p_username,'owner');c=null;events.clear();records.length=0;return Response.json(null)}
  if(name==='planner_whoop_connections'){
   assert(u.searchParams.get('username')==='eq.owner'||u.searchParams.get('whoop_user_id')==='eq.42')
   if(req.method==='PATCH'){
    if(value.refresh_lease_until&&!leaseAvailable)return Response.json(null)
    if(c)Object.assign(c,value)
    return Response.json(c)
   }
   return Response.json(u.searchParams.get('select')==='snapshot,snapshot_at'?{snapshot:c?.snapshot||{},snapshot_at:c?.snapshot_at||null}:c)
  }
  if(name==='planner_store_whoop_record'){
   assert.equal(value.p_username,'owner');assert.equal(value.p_connection_at,stamp)
   const existing=records.find(r=>r.kind===value.p_kind&&r.object_id===value.p_id)
   const row={kind:value.p_kind,object_id:value.p_id,data:value.p_data,observed_at:stamp,fingerprint:value.p_fingerprint}
   if(existing?.fingerprint===row.fingerprint)return Response.json(false)
   if(existing)Object.assign(existing,row);else records.push(row);stored++;return Response.json(true)
  }
  if(name==='planner_whoop_records'){assert.equal(u.searchParams.get('username'),'eq.owner');return Response.json(records)}
  if(name==='planner_whoop_events'){
   if(req.method==='POST'){
    assert.equal(value.username,'owner');if(events.has(value.trace_id))return Response.json({code:'23505'},{status:409})
    events.set(value.trace_id,{...value,processed_at:null});return Response.json({trace_id:value.trace_id})
   }
   const event=events.get(u.searchParams.get('trace_id')?.slice(3)||'')
   assert.equal(u.searchParams.get('username'),'eq.owner')
   if(req.method==='PATCH'){Object.assign(event,value);return new Response(null,{status:204})}
   return Response.json(event||null)
  }
  throw Error('Unexpected storage '+name)
 }
 const notice=(trace:string,type='sleep.updated')=>{
  const raw=JSON.stringify({user_id:42,id,type,trace_id:trace}),ts=String(Date.now())
  return new Request('https://planner.test/api/whoop/webhook',{method:'POST',body:raw,headers:{'x-whoop-signature-timestamp':ts,'x-whoop-signature':createHmac('sha256','fixture-secret').update(ts+raw).digest('base64')}})
 }
 try{
  const nativeState='fixture-native-return-state-1234'
  const started=await startWhoop('owner',nativeState);assert(started.url.includes('/api/whoop/authorize?ticket='));assert(!started.url.includes('fixture-secret'))
  const auth=await handleWhoopPublic(new Request(started.url),'/api/whoop/authorize'),authUrl=new URL(auth.headers.get('location')!)
  assert.equal(authUrl.hostname,'api.prod.whoop.com');assert.equal(authUrl.searchParams.get('scope'),WHOOP_SCOPES);assert(auth.headers.get('set-cookie')?.includes('HttpOnly'))
  const state=authUrl.searchParams.get('state'),cookie=auth.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
  const cb=(stateValue=state,cookieValue=cookie)=>new Request('https://planner.test/api/whoop/callback?state='+stateValue+'&code=fixture-code',{headers:{cookie:cookieValue}})
  await assert.rejects(()=>handleWhoopPublic(cb('wrong'),'/api/whoop/callback'),/expired/)
  await assert.rejects(()=>handleWhoopPublic(cb(state,'planner-whoop=wrong'),'/api/whoop/callback'),/expired/)
  const connected=await handleWhoopPublic(cb(),'/api/whoop/callback');assert.equal(connected.status,303);assert.equal(connected.headers.get('location'),'aiplanner://whoop?status=connected&state='+nativeState);assert.equal(tokenCalls,1);assert.equal(records.length,3)
  assert.notEqual(c.credentials,'fixture-access-1');assert.equal((openVmCredential(c.credentials) as any).access_token,'fixture-access-1')
  await assert.rejects(()=>handleWhoopPublic(cb(),'/api/whoop/callback'),/expired/)
  const webStart=await startWhoop('owner')
  const webAuth=await handleWhoopPublic(new Request(webStart.url),'/api/whoop/authorize')
  const webState=new URL(webAuth.headers.get('location')!).searchParams.get('state')
  const cancelled=await handleWhoopPublic(new Request('https://planner.test/api/whoop/callback?error=access_denied&state='+webState,{headers:{cookie:webAuth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')}}),'/api/whoop/callback')
  assert.match(cancelled.headers.get('location')!,/^https:.*connection=cancelled$/)
  const profile=await readWhoopApi('owner',{kind:'profile'});assert.equal((profile.data as any).email,'fixture@example.invalid')
  const fullSleep=await readWhoopApi('owner',{kind:'sleep'});assert.equal((fullSleep.data as any).records[0].score.stage_summary.total_rem_sleep_time_milli,2*3600000)
  const fullRecovery=await readWhoopApi('owner',{kind:'recovery'});assert.equal((fullRecovery.data as any).records[0].score.hrv_rmssd_milli,31.5)
  const body=await readWhoopApi('owner',{kind:'body'});assert.equal((body.data as any).weight_kilogram,70)
  const cycles=await readWhoopApi('owner',{kind:'cycles',limit:1});assert.equal((cycles.data as any).records[0].step_count,1000);assert.equal((cycles.data as any).next_token,'fixture-next')
  const next=await readWhoopApi('owner',{kind:'cycles',nextToken:(cycles.data as any).next_token});assert.equal((next.data as any).next_token,null)
  const workouts=await readWhoopApi('owner',{kind:'workouts',id});assert.equal((workouts.data as any).score.zone_duration.zone_five_milli,60000)
  await assert.rejects(()=>readWhoopApi('owner',{kind:'cycles',id:'../user/profile/basic'}),/valid WHOOP cycle/)
  await assert.rejects(()=>readWhoopApi('owner',{kind:'body',id:'42'}),/own account/)
  await assert.rejects(()=>readWhoopApi('owner',{kind:'sleep',start:'2026-11-16T00:00:00Z',end:'2026-11-15T00:00:00Z'}),/chronological/)
  const changes=stored
  await whoopWebhook(notice('first'));assert.equal(stored,changes,'unchanged API records do not rearm reviews')
  const calls=providerCalls;await whoopWebhook(notice('first'));assert.equal(providerCalls,calls,'completed duplicate does not refetch')
  failApi=true;await assert.rejects(()=>whoopWebhook(notice('retry')),/unavailable/);assert.equal(events.get('retry').processed_at,null)
  failApi=false;await whoopWebhook(notice('retry'));assert(events.get('retry').processed_at)
  c.credentials=sealVmCredential({access_token:'expired',refresh_token:'fixture-refresh-old',scope:WHOOP_SCOPES,expires_at:0})
  await syncWhoop('owner',id);assert.equal(tokenCalls,2);assert.equal((openVmCredential(c.credentials) as any).refresh_token,'fixture-refresh-2')
  c.credentials=sealVmCredential({access_token:'expired',refresh_token:'fixture-refresh-old',scope:WHOOP_SCOPES,expires_at:0});leaseAvailable=false
  await assert.rejects(()=>syncWhoop('owner',id),/refreshing/);assert.equal(tokenCalls,2,'another refresh lease never rotates the same token concurrently');leaseAvailable=true
  await whoopWebhook(notice('late-delete','sleep.deleted'));assert(!records[0].data.deleted,'late delete fetches current state instead of hiding a live record')
  await whoopWebhook(notice('workout-update','workout.updated'));assert.equal(stored,changes)
  deleted=true;await whoopWebhook(notice('delete','sleep.deleted'));await whoopWebhook(notice('workout-delete','workout.deleted'));assert(records.every(r=>r.data.deleted))
  await assert.rejects(()=>whoopWebhook(new Request('https://planner.test/api/whoop/webhook',{method:'POST',body:'{}'})),/signature/)
  await assert.rejects(()=>handleWhoopPublic(new Request('https://planner.test/api/whoop/reconcile'),'/api/whoop/reconcile'),/Unauthorized/)
  await disconnectWhoop('owner');assert(revoked);assert.equal(c,null);assert.equal(records.length,0)
  const after=providerCalls;await whoopWebhook(notice('after-disconnect'));assert.equal(providerCalls,after)
 }finally{globalThis.fetch=oldFetch;for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key]}}
})
