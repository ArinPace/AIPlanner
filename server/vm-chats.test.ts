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
    assert.equal(url.hostname,'chats.test');assert.ok(url.pathname.endsWith('/rpc/planner_manage_chats'))
    const body=await req.json() as {p_username:string;p_ids:string[];p_action:string}
    assert.equal(body.p_username,'arin');const ids=body.p_ids
    if(ids.some(id=>!rows.has(id)))return Response.json({code:'P0001',message:'Some selected chats are unavailable.'},{status:400})
    writes++
    if(body.p_action==='archive' || body.p_action==='restore')for(const id of ids)rows.get(id)!.archived=body.p_action==='archive'
    if(body.p_action==='purge')for(const id of ids)rows.delete(id)
    return Response.json({ok:true,ids,count:ids.length})
  }
  try {
    for(const input of [{ids:[],action:'delete'},{ids:[a,'bad'],action:'archive'},{ids:[a],action:'unknown'},{ids:Array(101).fill(a),action:'delete'}])await assert.rejects(()=>bulkManageChats('arin',input))
    assert.equal(requests,0)
    await assert.rejects(()=>bulkManageChats('arin',{ids:[a,foreign],action:'delete'}),/unavailable/);assert.equal(writes,0)
    const archived=await bulkManageChats('arin',{ids:[a,b,a],action:'archive'})
    assert.equal(archived.count,2);assert.equal(writes,1);assert.ok([...rows.values()].every(row=>row.archived))
    await bulkManageChats('arin',{ids:[a,b],action:'restore'});assert.equal(writes,2);assert.ok([...rows.values()].every(row=>!row.archived))
    await bulkManageChats('arin',{ids:[a,b],action:'delete'});assert.equal(rows.size,2);assert.equal(writes,3)
    await bulkManageChats('arin',{ids:[a,b],action:'untrash'});assert.equal(rows.size,2)
    await bulkManageChats('arin',{ids:[a,b],action:'purge'});assert.equal(rows.size,0)
  }finally{globalThis.fetch=oldFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
