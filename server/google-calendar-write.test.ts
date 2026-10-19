import test from 'node:test'
import assert from 'node:assert/strict'
import {saveGoogleEvent,readGoogleEvent} from './google-calendar-write.js'
import {GOOGLE_CALENDAR_SCOPE,GOOGLE_CALENDAR_WRITE_SCOPE} from './agent.js'
import {sealVmCredential} from './vm-vault.js'
test('Google edits require owner consent/current etag, save a backup first, preserve omitted fields and read back',async()=>{
 const originalFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','CONNECTION_ENCRYPTION_KEY'] as const,saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY;process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32)
 const accountId='ee34ba25-54bc-44df-8515-f7e6784dfed1',tokens={access_token:'private-token',scope:GOOGLE_CALENDAR_SCOPE+' '+GOOGLE_CALENDAR_WRITE_SCOPE,expires_at:Date.now()+3600000}
 let canEdit=true,writes=0,backedUp=false,audit:any=null
 let event:any={id:'existing',etag:'v1',summary:'Call',description:'Preserved notes',attendees:[{email:'friend@example.com'}],start:{dateTime:'2026-10-20T10:00:00-04:00'},end:{dateTime:'2026-10-20T10:30:00-04:00'}}
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url)
  if(url.hostname==='database.test'){
   if(request.method==='GET')assert.equal(url.searchParams.get('username'),'eq.arin')
   if(url.pathname.endsWith('planner_vm_settings'))return Response.json({google_account_id:accountId,sources:['calendar']})
   if(url.pathname.endsWith('planner_google_accounts')){
    if(url.searchParams.get('id')&&url.searchParams.get('id')!=='eq.'+accountId)return Response.json(null)
    const account={id:accountId,identity:'owner@example.com',credentials:sealVmCredential({...tokens,scope:canEdit?tokens.scope:GOOGLE_CALENDAR_SCOPE})}
    return Response.json(url.searchParams.get('id')?account:[account])
   }
   if(url.pathname.endsWith('planner_calendar_history')){
    const body=await request.json() as any
    if(request.method==='POST'){assert.equal(body.username,'arin');if(body.before)assert.deepEqual(body.before,event);audit=body;backedUp=true;return Response.json({id:42})}
    assert.equal(url.searchParams.get('username'),'eq.arin');assert.equal(url.searchParams.get('id'),'eq.42');audit={...audit,...body};return new Response(null,{status:204})
   }
  }
  if(url.hostname==='www.googleapis.com'){
   assert.equal(request.headers.get('authorization'),'Bearer private-token')
   if(request.method==='GET')return Response.json(event)
   assert.equal(backedUp,true);writes++;assert.equal(url.searchParams.get('sendUpdates'),'none')
   const patch=await request.json() as any
   if(request.method==='PATCH'){assert.equal(request.headers.get('if-match'),'v1');assert.equal(patch.attendees,undefined);assert.equal(patch.description,undefined);event={...event,...patch,etag:'v2'}}
   else {assert.equal(request.method,'POST');assert.equal(patch.id,'11223344556647778899aabbccddeeff');if(event?.id===patch.id)return new Response(null,{status:409});event={...patch,etag:'created'}}
   return Response.json(event)
  }
  throw Error('Unexpected request '+url.pathname)
 }
 try{
  canEdit=false;await assert.rejects(()=>saveGoogleEvent('arin',{eventId:'existing',etag:'v1',title:'New'}),/read-only/);assert.equal(writes,0)
  canEdit=true;await assert.rejects(()=>saveGoogleEvent('arin',{eventId:'existing',etag:'stale',title:'New'}),/changed/);assert.equal(writes,0)
  await assert.rejects(()=>saveGoogleEvent('arin',{accountId:'bb34ba25-54bc-44df-8515-f7e6784dfed1',eventId:'existing',etag:'v1',title:'New'}),/Connect Google/)
  const result=await saveGoogleEvent('arin',{eventId:'existing',etag:'v1',start:'2026-10-20T11:00:00-04:00',end:'2026-10-20T11:30:00-04:00'})
  assert.equal(result.saved,true);assert.equal(result.event.description,'Preserved notes');assert.equal(result.event.attendees.length,1);assert.equal(audit.kind,'google-updated');assert.equal(audit.after.etag,'v2')
  assert.equal((await readGoogleEvent('arin',{eventId:'existing'})).event.etag,'v2')
  event.recurrence=['RRULE:FREQ=WEEKLY'];await assert.rejects(()=>saveGoogleEvent('arin',{eventId:'existing',etag:'v2',title:'Series'}),/scope series/)
  const create={requestId:'11223344-5566-4777-8899-aabbccddeeff',title:'Study session',start:'2026-10-21T10:00:00-04:00',end:'2026-10-21T11:00:00-04:00'}
  await assert.rejects(()=>saveGoogleEvent('arin',{title:'Missing retry key',start:create.start,end:create.end}),/requestId/)
  const created=await saveGoogleEvent('arin',create);assert.equal(created.event.id,'11223344556647778899aabbccddeeff');assert.equal(audit.before,null);assert.equal(audit.kind,'google-created')
  await assert.rejects(()=>saveGoogleEvent('arin',create),/already exists/);assert.equal(event.summary,'Study session')
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
