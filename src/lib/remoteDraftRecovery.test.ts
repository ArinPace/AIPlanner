import test from 'node:test'
import assert from 'node:assert/strict'
import {clearReviewedDraft} from './remoteDraftRecovery.js'
test('confirmed empty readback dismisses a popup even when the clear reply failed',async()=>{
 assert.deepEqual(await clearReviewedDraft('fixture',async()=>{throw Error('reply lost')},async()=>({text:''})),{cleared:true})
})
test('changed or unverified drafts remain visible and are never cleared again',async()=>{
 let clears=0
 const clear=async(expected:string)=>{assert.equal(expected,'reviewed');clears++;throw Error('Draft changed')}
 assert.deepEqual(await clearReviewedDraft('reviewed',clear,async()=>({text:'new writing'})),{cleared:false,text:'new writing',error:'Draft changed'})
 assert.equal(clears,1)
 const result=await clearReviewedDraft('reviewed',async()=>{},async()=>{throw Error('offline')})
 assert.equal(result.cleared,false);if(!result.cleared)assert.equal(result.text,'reviewed')
})
