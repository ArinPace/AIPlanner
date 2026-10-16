import test from 'node:test'
import assert from 'node:assert/strict'
import { startGoogleCalendar, googleCalendarStatus, selectGoogleAccount, removeGoogleAccount, readGoogleCalendar, GOOGLE_CALENDAR_SCOPE } from './agent.js'
import { sealVmCredential } from './vm-vault.js'

test('Google accounts are owner scoped, tokens stay private, and Calendar uses the selected grant',async()=>{
  const previousFetch=globalThis.fetch
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','CONNECTION_ENCRYPTION_KEY'] as const
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
  process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';delete process.env.SUPABASE_SECRET_KEY
  process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='test-secret';process.env.CONNECTION_ENCRYPTION_KEY='ab'.repeat(32)
  const tokens={access_token:'test-access',refresh_token:'test-refresh',scope:GOOGLE_CALENDAR_SCOPE,expires_at:Date.now()+3600000}
  const account={id:'ee34ba25-54bc-44df-8515-f7e6784dfed1',identity:'owner@example.com',credentials:sealVmCredential(tokens),updated_at:new Date().toISOString()}
  let attempt:Record<string,unknown>|null=null,selected=false,revoked=false,deleted=false,refreshed=false,persisted=false
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url)
    if(url.hostname==='database.test'){
      if(url.pathname.endsWith('/planner_oauth_attempts')){attempt=await request.json() as Record<string,unknown>;return new Response(null,{status:201})}
      if(url.pathname.endsWith('/planner_vm_settings')){
        if(request.method==='GET'){assert.equal(url.searchParams.get('username'),'eq.arin');return Response.json({google_account_id:account.id})}
        const data=await request.json() as Record<string,unknown>;assert.equal(data.username,'arin');assert.equal(data.google_account_id,account.id);selected=true;return new Response(null,{status:201})
      }
      if(url.pathname.endsWith('/planner_google_accounts')){
        assert.equal(url.searchParams.get('username'),'eq.arin')
        if(request.method==='DELETE'){deleted=true;assert.equal(url.searchParams.get('id'),'eq.'+account.id);return new Response(null,{status:204})}
        const id=url.searchParams.get('id')
        if(id && id!=='eq.'+account.id)return Response.json(null)
        if(request.method==='PATCH'){
          assert.equal(id,'eq.'+account.id)
          const data=await request.json() as {credentials:string}
          assert.ok(!data.credentials.includes('fresh-access'));account.credentials=data.credentials;persisted=true
          return new Response(null,{status:204})
        }
        return Response.json(id ? account : [account])
      }
    }
    if(url.href==='https://oauth2.googleapis.com/token'){
      const form=new URLSearchParams(await request.text());assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('refresh_token'),'test-refresh');refreshed=true
      return Response.json({access_token:'fresh-access',expires_in:3600})
    }
    if(url.hostname==='www.googleapis.com' && url.pathname.includes('/calendar/')){assert.equal(request.headers.get('authorization'),refreshed?'Bearer fresh-access':'Bearer test-access');return Response.json({timeZone:'UTC',items:[{id:'event',summary:'Verified event'}]})}
    if(url.href==='https://oauth2.googleapis.com/revoke'){assert.equal(new URLSearchParams(await request.text()).get('token'),'test-refresh');revoked=true;return Response.json({})}
    throw new Error('Unexpected test request '+url.origin+url.pathname)
  }
  try{
    const response=await startGoogleCalendar('arin'),data=await response.json() as {url:string},url=new URL(data.url)
    assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'openid email '+GOOGLE_CALENDAR_SCOPE)
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline')
    assert.match(response.headers.get('set-cookie') || '',/HttpOnly; Secure; SameSite=Lax/);assert.equal((attempt as Record<string,unknown>|null)?.username,'arin')
    const status=await googleCalendarStatus('arin');assert.equal(status.activeAccountId,account.id);assert.ok(!JSON.stringify(status).includes('test-access'));assert.ok(!JSON.stringify(status).includes('credentials'))
    await selectGoogleAccount('arin',account.id);assert.ok(selected)
    await assert.rejects(()=>selectGoogleAccount('arin','bb34ba25-54bc-44df-8515-f7e6784dfed1'),/not found/)
    const calendar=await readGoogleCalendar('arin',undefined,undefined,account.id);assert.equal(calendar.events[0].title,'Verified event')
    account.credentials=sealVmCredential({...tokens,expires_at:Date.now()-60000})
    const renewed=await readGoogleCalendar('arin',undefined,undefined,account.id)
    assert.equal(renewed.events[0].title,'Verified event');assert.ok(refreshed && persisted,'Offline access must renew and persist an expired access token without a browser')
    await assert.rejects(()=>readGoogleCalendar('arin',undefined,undefined,'bb34ba25-54bc-44df-8515-f7e6784dfed1'),/Connect Google/)
    await removeGoogleAccount('arin',account.id);assert.ok(revoked && deleted)
  }finally{globalThis.fetch=previousFetch;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}}
})
