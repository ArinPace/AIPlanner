import test from 'node:test'
import assert from 'node:assert/strict'
import {syncTutorChats,tutorSubjects} from './vm-tutor.js'
test('Tutor maps only immediate Subjects children and reuses one owned conversation per folder',async()=>{
 const folders=[{id:'root',name:'Subjects',parentId:null},{id:'a',name:'Statistics',parentId:'root'},{id:'b',name:'Computer Science',parentId:'root'},{id:'nested',name:'Homework',parentId:'a'},{id:'else',name:'Personal',parentId:null}]
 assert.deepEqual(tutorSubjects(folders).map(f=>f.id),['b','a'])
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));process.env.SUPABASE_URL='https://tutor.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let enabled=false,creates=0;const rows:any[]=[]
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url),table=url.pathname.split('/').at(-1)
  if(req.method==='GET'||req.method==='PATCH')assert.equal(url.searchParams.get('username'),'eq.owner')
  if(table==='planner_vm_settings'){if(req.method==='POST'){assert.deepEqual(await req.json(),{username:'owner',tutor_enabled:true});enabled=true;return new Response(null,{status:204})}return Response.json({tutor_enabled:enabled})}
  if(table==='planner_sync_tutor_chats'){assert.deepEqual(await req.json(),{p_username:'owner'});for(const folder of tutorSubjects(folders)){const row=rows.find(r=>r.tutor_subject_id===folder.id);if(!row){rows.push({id:'chat-'+folder.id,tutor_subject_id:folder.id,title:folder.name,deleted_at:null});creates++}else if(!row.deleted_at)row.title=folder.name}return Response.json({enabled:true,count:2})}
  assert.equal(table,'planner_vm_chats')
  if(req.method==='POST'){for(const row of await req.json() as any[]){assert.equal(row.username,'owner');if(!rows.some(r=>r.tutor_subject_id===row.tutor_subject_id)){rows.push({...row,id:'chat-'+row.tutor_subject_id,archived:false,deleted_at:null});creates++}}return new Response(null,{status:204})}
  if(req.method==='PATCH'){const row=rows.find(r=>r.id===url.searchParams.get('id')?.slice(3));Object.assign(row,await req.json());return new Response(null,{status:204})}
  return Response.json(rows)
 }
 try{
  assert.equal((await syncTutorChats('owner')).enabled,false);assert.equal(creates,0)
  assert.equal((await syncTutorChats('owner',true)).count,2);assert.equal(creates,2)
  await syncTutorChats('owner');assert.equal(creates,2)
  const id=rows[0].id;folders.find(f=>f.id===rows[0].tutor_subject_id)!.name='Renamed subject';await syncTutorChats('owner');assert.equal(rows[0].id,id);assert.equal(rows[0].title,'Renamed subject')
  rows[0].deleted_at='2026-11-04T00:00:00Z';await syncTutorChats('owner');assert.equal(creates,2);assert(rows[0].deleted_at,'Sync must not silently restore a deleted chat')
 }finally{globalThis.fetch=old;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
