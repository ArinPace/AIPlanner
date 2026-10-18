import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {refreshRuntimeInstructions} from './runtime-instructions.mjs'
test('existing threads receive current developer instructions once per change and retain history',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'planner-instructions-')),calls=[]
 const rpc={request:async(method,params)=>calls.push({method,params})}
 try{
  const args={threadId:'existing',instructions:'Current application rules',dataDir,resumed:true}
  await refreshRuntimeInstructions(rpc,args)
  await refreshRuntimeInstructions(rpc,args)
  assert.equal(calls.length,1)
  assert.equal(calls[0].method,'thread/inject_items')
  assert.equal(calls[0].params.items[0].role,'developer')
  assert.equal(calls[0].params.items[0].content[0].text,args.instructions)
  await refreshRuntimeInstructions(rpc,{...args,instructions:'Updated consent'})
  assert.equal(calls.length,2)
  await refreshRuntimeInstructions(rpc,{...args,threadId:'new',resumed:false})
  assert.equal(calls.length,2)
  await refreshRuntimeInstructions(rpc,{...args,threadId:'new',resumed:true})
  assert.equal(calls.length,2)
 }finally{await rm(dataDir,{recursive:true,force:true})}
})
