import test from 'node:test'
import assert from 'node:assert/strict'
import { runtimeQuestions, relayApproval } from './approval-bridge.mjs'

test('runtime approval bridge relays the user decision and never grants unsupported permissions', async()=>{
  const params={questions:[{id:'q',question:'Open selected chat?',options:[{label:'Accept'},{label:'Decline'}]}]}
  assert.throws(()=>runtimeQuestions('item/commandExecution/requestApproval',params))
  assert.throws(()=>runtimeQuestions('item/tool/requestUserInput',{questions:[{...params.questions[0],isSecret:true}]}))
  assert.throws(()=>runtimeQuestions('item/tool/requestUserInput',{questions:[{...params.questions[0],options:null}]}))
  const calls=[]
  const response=await relayApproval('item/tool/requestUserInput',params,{job:{id:'job',lease:'lease'},report:async()=>{},api:async(action,input)=>{
    calls.push(input)
    return input.action==='create'?{id:'request',expires_at:new Date(Date.now()+10000).toISOString()}:{answers:{q:'Decline'}}
  }})
  assert.deepEqual(response,{answers:{q:{answers:['Decline']}}})
  assert.equal(calls[0].jobId,'job');assert.equal(calls[1].lease,'lease')
})
