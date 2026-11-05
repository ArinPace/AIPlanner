import test from 'node:test'
import assert from 'node:assert/strict'
import {assertBranchableJob} from './chat-branch-policy.js'
import {canBranchChat} from '../src/lib/chatBranching.js'
test('Main and Tutor cannot fork through reply or edit branching; normal owned chats can',async()=>{
 const old=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 process.env.SUPABASE_URL='https://branch-policy.test';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.SUPABASE_SECRET_KEY
 let chat:any={is_main:true,tutor_subject_id:null},missing=false
 globalThis.fetch=async(input,init)=>{const url=new URL(new Request(input,init).url);assert.equal(url.searchParams.get('username'),'eq.owner');return Response.json(missing?null:url.pathname.endsWith('/planner_vm_jobs')?{chat_id:'chat'}:chat)}
 try{assert.equal(canBranchChat(null),false);await assert.rejects(()=>assertBranchableJob('owner','job'),/disabled/);chat={is_main:false,tutor_subject_id:'subject'};await assert.rejects(()=>assertBranchableJob('owner','job'),/disabled/);chat={is_main:false,tutor_subject_id:null};await assert.doesNotReject(()=>assertBranchableJob('owner','job'));missing=true;await assert.rejects(()=>assertBranchableJob('owner','foreign'),/not found/)}finally{globalThis.fetch=old;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
})
