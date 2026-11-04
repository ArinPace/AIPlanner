import test from 'node:test'
import assert from 'node:assert/strict'
import {notificationInbox} from './notification-inbox.js'
test('notification checklist updates only owned records and preserves missing ownership errors',async()=>{
 const previous=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://inbox.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';delete process.env.SUPABASE_SECRET_KEY
 let writes=0
 globalThis.fetch=async(input,options)=>{const request=new Request(input,options),url=new URL(request.url);assert.equal(url.pathname,'/rest/v1/planner_notification_inbox');assert.equal(url.searchParams.get('username'),'eq.owner');assert.equal(request.method,'PATCH');assert.deepEqual(await request.json(),{checked:true});writes++;return Response.json(url.searchParams.get('id')==='eq.owned'?[{id:'owned'}]:[])}
 const patch=(id:string)=>notificationInbox(new Request('https://planner.test/api/agent/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,checked:true})}),'owner')
 try{assert.equal((await patch('owned')).status,200);await assert.rejects(()=>patch('foreign'),/not found/);assert.equal(writes,2)}finally{globalThis.fetch=previous;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})
