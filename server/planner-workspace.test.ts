import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createPlannerMcp } from './mcp.js'
import { saveEvent, readPdf, searchFiles } from './planner-workspace.js'
import {eventPatch} from './planner-workspace.js'
import {z} from 'zod'

test('event urgency is optional, nullable and constrained to whole numbers 0–99',()=>{
 const schema=z.object(eventPatch)
 for(const urgency of [undefined,null,0,99])assert.ok(schema.safeParse({revision:0,urgency}).success)
 for(const urgency of [-1,100,0.5,'5'])assert.equal(schema.safeParse({revision:0,urgency}).success,false)
})

// Tiny parser fixture: one page of selectable text, no external resources.
export function pdfFixture() {
  const stream='BT /F1 12 Tf 72 720 Td (Planner PDF verification 824) Tj ET'
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let out='%PDF-1.4\n';const offsets=[0]
  objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${value}\nendobj\n`})
  const start=Buffer.byteLength(out)
  out+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return out
}

test('internal calendar and all Files: scoped partial edits, hierarchy, pagination, PDFs and conflicts',async()=>{
  const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'] as const
  const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
  process.env.SUPABASE_URL='https://workspace.test';delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
  let calendar={revision:4,state:{events:[{id:'event',title:'Class',description:'Keep me',start:'2026-10-17T09:00:00-04:00',end:'2026-10-17T10:00:00-04:00',allDay:false,tagIds:['school'],recurrence:{frequency:'weekly',interval:1,until:null},agentSnapshot:'preserve'}],tags:[{id:'school',name:'School',color:'#123456'}],hiddenTagIds:['school']}}
  let files={revision:2,state:{folders:[{id:'root',name:'School',parentId:null,color:'#123456',labels:['study'],updatedAt:'2026-10-16T00:00:00Z'},{id:'child',name:'CS',parentId:'root',color:'#123456',labels:[],updatedAt:'2026-10-16T00:00:00Z'}],files:[{id:'note',name:'Notes',folderId:'child',content:'Needle in note contents',updatedAt:'2026-10-16T00:00:00Z'}],documents:[{id:'82400000-0000-4000-8000-000000000000',name:'Assignment.pdf',folderId:'child',kind:'pdf' as const,size:1000,updatedAt:'2026-10-16T00:00:00Z'}]}}
  let conflict=false,downloads=0
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),u=new URL(request.url)
    assert.equal(u.hostname,'workspace.test')
    if(u.pathname.startsWith('/storage/')){downloads++;assert.ok(u.pathname.endsWith('/arin/82400000-0000-4000-8000-000000000000.pdf'));return new Response(pdfFixture(),{headers:{'Content-Type':'application/pdf'}})}
    assert.equal(u.searchParams.get('username'),'eq.arin')
    if(u.pathname.endsWith('/planner_uploads'))return Response.json(u.searchParams.get('id')==='eq.missing'?null:{storage_path:'arin/82400000-0000-4000-8000-000000000000.pdf',status:'complete'})
    const isCalendar=u.pathname.endsWith('/planner_calendars')
    assert.ok(isCalendar || u.pathname.endsWith('/planner_files'))
    if(request.method==='GET')return Response.json(isCalendar?calendar:files)
    const row=isCalendar?calendar:files
    assert.equal(u.searchParams.get('revision'),'eq.'+row.revision)
    if(conflict)return Response.json([])
    const update=await request.json() as typeof row
    if(isCalendar)calendar={...calendar,...update} as typeof calendar;else files={...files,...update} as typeof files
    return Response.json([{revision:update.revision}])
  }
  const server=createPlannerMcp('arin',['planner:read','planner:write']),client=new Client({name:'test',version:'1'})
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct)
  try {
    const result=await saveEvent('arin',{id:'event',revision:4,title:'Updated class'})
    assert.equal(result.event.description,'Keep me');assert.equal(result.event.agentSnapshot,'preserve');assert.deepEqual(result.event.tagIds,['school']);assert.equal(result.event.recurrence.frequency,'weekly');assert.deepEqual(calendar.state.hiddenTagIds,['school'])
    await assert.rejects(()=>saveEvent('arin',{id:'event',revision:4,title:'Stale'}),/latest calendar/)
    await assert.rejects(()=>saveEvent('arin',{id:'missing',revision:5,title:'No'}),/not found/)
    await assert.rejects(()=>saveEvent('arin',{id:'event',revision:5,tagIds:['unknown']}),/tag IDs/)
    conflict=true;await assert.rejects(()=>saveEvent('arin',{id:'event',revision:5,title:'Conflict'}),/Calendar changed/);conflict=false
    assert.equal(result.event.urgency,undefined)
    const urgent=await saveEvent('arin',{id:'event',revision:5,urgency:8})
    assert.equal(urgent.event.urgency,8);assert.equal(urgent.event.description,'Keep me')
    const preserved=await saveEvent('arin',{id:'event',revision:6,title:'Urgent class'})
    assert.equal(preserved.event.urgency,8)
    const cleared=await saveEvent('arin',{id:'event',revision:7,urgency:null})
    assert.equal(cleared.event.urgency,null);assert.equal(cleared.event.recurrence.frequency,'weekly')
    const found=searchFiles(files.state,{query:'needle',folderId:'root'})
    assert.equal(found.total,1);assert.equal(found.items[0].path,'School / CS')
    assert.equal(searchFiles(files.state,{limit:1}).hasMore,true)
    assert.throws(()=>searchFiles(files.state,{folderId:'missing'}),/not found/)
    const note=await client.callTool({name:'planner_read_file',arguments:{id:'note',offset:0,limit:6}})
    assert.match(JSON.stringify(note.structuredContent),/Needle/);assert.match(JSON.stringify(note.structuredContent),/"hasMore":true/)
    const moved=await client.callTool({name:'planner_update_item',arguments:{id:'note',revision:2,folderId:'root',name:'New notes'}})
    assert.ok(!moved.isError);assert.equal(files.state.files[0].content,'Needle in note contents');assert.equal(files.state.files[0].folderId,'root')
    const cycle=await client.callTool({name:'planner_update_item',arguments:{id:'root',revision:3,parentId:'child'}})
    assert.equal(cycle.isError,true);assert.equal(files.revision,3)
    const wrongType=await client.callTool({name:'planner_update_item',arguments:{id:files.state.documents[0].id,revision:3,content:'No overwrite'}})
    assert.equal(wrongType.isError,true)
    const converted=await client.callTool({name:'planner_update_item',arguments:{id:'note',revision:3,format:'note',pinned:true}})
    assert.ok(!converted.isError)
    assert.equal((converted.structuredContent as any).result.item.format,'note')
    assert.equal((converted.structuredContent as any).result.item.content,'Needle in note contents')
    const created=await client.callTool({name:'planner_save_note',arguments:{folderId:null,name:'Real Note',content:'## Tasks\n- [ ] Read syllabus #school',revision:4}})
    assert.ok(!created.isError)
    const saved=(created.structuredContent as any).result
    assert.equal(saved.format,'note')
    assert.deepEqual(saved.file.tags,['school'])
    const plain=await client.callTool({name:'planner_save_text_file',arguments:{folderId:null,name:'Plain.txt',content:'literal text',revision:5}})
    assert.ok(!plain.isError)
    assert.equal((plain.structuredContent as any).result.format,'text')
    const edited=await client.callTool({name:'planner_save_note',arguments:{id:'note',folderId:'root',name:'New notes',content:'Updated writing',revision:6}})
    assert.ok(!edited.isError)
    assert.equal((edited.structuredContent as any).result.file.pinned,true)
    assert.equal((edited.structuredContent as any).result.file.format,'note')
    const stale=await client.callTool({name:'planner_save_note',arguments:{id:'note',folderId:null,name:'Stale',content:'No',revision:3}})
    assert.equal(stale.isError,true)
    const foundNotes=searchFiles(files.state,{})
    assert.equal(foundNotes.items.find(item=>item.id==='note')?.kind,'note')
    assert.equal(foundNotes.items.find(item=>item.id===(plain.structuredContent as any).result.fileId)?.kind,'text')
    const tagResult=await client.callTool({name:'planner_save_tag',arguments:{name:'Work',color:'#d50000',hidden:true,revision:8}})
    assert.ok(!tagResult.isError)
    const tag=(tagResult.structuredContent as any).result.tag
    assert.ok(calendar.state.tags.some(item=>item.id===tag.id))
    assert.ok(calendar.state.hiddenTagIds.includes(tag.id))
    const visibleTag=await client.callTool({name:'planner_save_tag',arguments:{id:tag.id,hidden:false,revision:9}})
    assert.ok(!visibleTag.isError)
    assert.ok(!calendar.state.hiddenTagIds.includes(tag.id))
    const pdf=await readPdf('arin',files.state.documents[0].id,1,1)
    assert.match(pdf.pages[0].text,/Planner PDF verification 824/);assert.equal(pdf.nextPage,null)
    await assert.rejects(()=>readPdf('arin','missing',1,1),/not available/);assert.equal(downloads,1)
  } finally {await client.close();await server.close();globalThis.fetch=oldFetch;for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key]}}
})
