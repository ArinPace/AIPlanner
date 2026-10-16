import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkManageChats } from './vm-chats.js'

test('bulk chat actions validate the entire selection and mutate only owned IDs in one statement',async()=>{
  const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const
  const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
  process.env.SUPABASE_URL='https://chats.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
  const a='82400000-0000-4000-8000-000000000001',b='82400000-0000-4000-8000-000000000002',foreign='82400000-0000-4000-8000-000000000003'
  const rows=new Map([[a,{id:a,archived:false}],[b,{id:b,archived:false}]])
  let writes=0,requests=0
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init),url=new URL(req.url);requests++
    assert.equal(url.hostname,'chats.test');assert.ok(url.pathname.endsWith('/planner_vm_chats'));assert.equal(url.searchParams.get('username'),'eq.arin')
    const filter=url.searchParams.get('id')!;assert.ok(filter.startsWith('in.('))
    const ids=filter.slice(4,-1).split(',').map(id=>id.replaceAll('"',''))
    if(req.method==='GET')return Response.json(ids.filter(id=>rows.has(id)).map(id=>({id})))
    writes++
    if(req.method==='PATCH'){
      const patch=await req.json() as {archived:boolean}
      for(const id of ids)if(rows.has(id))rows.get(id)!.archived=patch.archived
    }else {assert.equal(req.method,'DELETE');for(const id of ids)rows.delete(id)}
    return Response.json(ids.map(id=>({id})))
  }
  try {
    for(const input of [{ids:[],action:'delete'},{ids:[a,'bad'],action:'archive'},{ids:[a],action:'unknown'},{ids:Array(101).fill(a),action:'delete'}])await assert.rejects(()=>bulkManageChats('arin',input))
    assert.equal(requests,0)
    await assert.rejects(()=>bulkManageChats('arin',{ids:[a,foreign],action:'delete'}),/unavailable/);assert.equal(writes,0)
    const archived=await bulkManageChats('arin',{ids:[a,b,a],action:'archive'})
    assert.equal(archived.count,2);assert.equal(writes,1);assert.ok([...rows.values()].every(row=>row.archived))
    await bulkManageChats('arin',{ids:[a,b],action:'restore'});assert.equal(writes,2);assert.ok([...rows.values()].every(row=>!row.archived))
    await bulkManageChats('arin',{ids:[a,b],action:'delete'});assert.equal(rows.size,0);assert.equal(writes,3)
  }finally{globalThis.fetch=oldFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
