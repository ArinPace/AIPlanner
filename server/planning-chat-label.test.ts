import test from 'node:test'
import assert from 'node:assert/strict'
import {planningChatLabel,isPlanningLaunch} from '../src/lib/planningChatLabel.js'

test('planning launch instructions have a compact display label without changing ordinary messages',()=>{
 const launch='I clicked the permanent Start planning my calendar button. Run the same review/update workflow as my scheduled task now: private execution instructions'
 assert.equal(planningChatLabel(launch),'Begin Planning')
 assert.equal(isPlanningLaunch(launch),true)
 for(const ordinary of ['Begin Planning','Can we plan my calendar?','I clicked the permanent Start planning my calendar button. Please explain it.']){
  assert.equal(planningChatLabel(ordinary),ordinary)
  assert.equal(isPlanningLaunch(ordinary),false)
 }
})
