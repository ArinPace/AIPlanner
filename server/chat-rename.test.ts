import test from 'node:test'
import assert from 'node:assert/strict'
import { handleVmRequest } from './vm.js'
import { binDaysLeft } from '../src/lib/bin.js'

test('chat rename validates names, scopes writes to the owner and excludes deleted chats',async()=>{
  const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const
  const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
  process.env.SUPABASE_URL='https://rename.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
  const id='82400000-0000-4000-8000-000000000001';let requests=0,missing=false
  globalThis.fetch=async(input,init)=>{
    requests++;const r=new Request(input,init),u=new URL(r.url)
    assert.equal(r.method,'PATCH');assert.equal(u.hostname,'rename.test');assert.equal(u.searchParams.get('username'),'eq.arin');assert.equal(u.searchParams.get('id'),'eq.'+id);assert.equal(u.searchParams.get('deleted_at'),'is.null')
    assert.equal((await r.json() as {title:string}).title,'Renamed chat')
    return Response.json(missing?[]:[{id,title:'Renamed chat'}])
  }
  async function rename(title:string){return handleVmRequest(new Request('https://planner.test/api/agent/vm/chats/rename',{method:'POST',body:JSON.stringify({id,title})}),'/api/agent/vm/chats/rename','arin')}
  try{
    for(const title of ['', '   ','x'.repeat(101)])await assert.rejects(()=>rename(title),/between 1 and 100/)
    assert.equal(requests,0)
    assert.equal((await rename('  Renamed chat  ')).status,200)
    missing=true;await assert.rejects(()=>rename('Renamed chat'),/not found/)
  }finally{globalThis.fetch=oldFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})

test('Bin displays never exceed 30 days even when the client clock is behind the server',()=>{
  assert.equal(binDaysLeft(30*86400000+10000,0),30)
  assert.equal(binDaysLeft(29.5*86400000,0),30)
  assert.equal(binDaysLeft(-10000,0),0)
  assert.equal(binDaysLeft('invalid',0),0)
})
