import test from 'node:test'
import assert from 'node:assert/strict'
import {handleVmRequest} from './vm.js'
test('model settings validate the connected catalog and save only the authenticated owner',async()=>{
 process.env.SUPABASE_URL='https://models.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only'
 const original=globalThis.fetch;let writes:any[]=[]
 globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert.equal(url.searchParams.get('username'),'eq.owner');if(req.method==='GET'){assert(url.pathname.endsWith('planner_vm_hosts'));return Response.json([{capabilities:{modelCatalog:[{model:'a',label:'Model A',efforts:['high'],tiers:[{id:'fast',label:'Fast'}]}]}}])}assert.equal(req.method,'PATCH');assert(url.pathname.endsWith('planner_vm_settings'));writes.push(await req.json());return new Response(null,{status:204})}
 const save=(options:unknown)=>handleVmRequest(new Request('https://planner.test/api/agent/vm/model-options',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({options,username:'other'})}),'/api/agent/vm/model-options','owner')
 try{await save({model:'a',effort:'high',serviceTier:'fast'});assert.deepEqual(writes[0].generation_options,{model:'a',effort:'high',serviceTier:'fast'});await assert.rejects(()=>save({model:'a',effort:'ultra'}));assert.equal(writes.length,1);await save({});assert.deepEqual(writes[1].generation_options,{reset:true})}finally{globalThis.fetch=original}
})
