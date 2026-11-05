import test from 'node:test'
import assert from 'node:assert/strict'
import {submitDeviceCommand,readDeviceCommand,cancelDeviceCommand,handleDeviceCommands} from './device-commands.js'
test('device commands are owner-scoped, idempotent, acknowledged once and cancellable before delivery',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://device-command.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let row:any=null,writes=0;const id='11111111-1111-4111-8111-111111111111'
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),u=new URL(req.url);assert(u.pathname.endsWith('/planner_device_commands'))
  if(req.method==='POST'){const data=await req.json() as any;assert.equal(data.username,'owner');writes++;row={...data,id,status:'queued',result:null,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+120000).toISOString()};return Response.json(row)}
  const owner=u.searchParams.get('username');assert(owner==='eq.owner'||owner==='eq.foreign')
  if(req.method==='GET')return Response.json(owner==='eq.owner'&&(!u.searchParams.has('status')||u.searchParams.get('status')==='eq.'+row?.status)?row:null)
  if(owner!=='eq.owner'||u.searchParams.get('status')!=='eq.'+row?.status)return Response.json(null)
  row={...row,...await req.json() as any};return Response.json(u.searchParams.get('select')==='id'?[{id}]:row)
 }
 const action=(account:string,input:any)=>handleDeviceCommands(new Request('https://planner.test/api/device/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),account)
 try{
  const queued=await submitDeviceCommand('owner',{requestKey:'same',command:{action:'screen_time_read'}});assert.equal(queued.executed,false);assert.equal(writes,1)
  await submitDeviceCommand('owner',{requestKey:'same',command:{action:'screen_time_read'}});assert.equal(writes,1)
  await assert.rejects(()=>submitDeviceCommand('owner',{requestKey:'same',command:{action:'screen_time_stop',expected:'a'.repeat(64)}}),/different arguments/)
  await assert.rejects(()=>readDeviceCommand('foreign',id),/not found/)
  assert.equal((await (await action('owner',{action:'claim'})).json() as any).command.status,'running')
  assert.equal((await (await action('owner',{action:'claim'})).json() as any).command,null)
  await assert.rejects(()=>action('foreign',{action:'finish',id,result:{},ok:true}),/another account/)
  await action('owner',{action:'finish',id,result:{executed:true,clientResult:{authorized:true}},ok:true})
  assert.equal((await readDeviceCommand('owner',id)).executed,true)
  await assert.rejects(()=>action('owner',{action:'finish',id,result:{},ok:true}),/changed/)
  row.status='queued';assert.equal((await cancelDeviceCommand('owner',id)).cancelled,true)
  row.status='running';row.expires_at=new Date(Date.now()-1).toISOString();assert.equal((await readDeviceCommand('owner',id)).status,'expired');assert.equal((await readDeviceCommand('owner',id)).executed,false)
 }finally{globalThis.fetch=old;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
})
