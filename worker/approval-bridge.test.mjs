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
  assert.deepEqual(runtimeQuestions('mcpServer/elicitation/request',{mode:'form',message:'Confirm selected read',requestedSchema:{type:'object',properties:{approve:{type:'boolean'}}}}),[{id:'approve',question:'Confirm selected read',options:['Allow','Decline']}])
  assert.throws(()=>runtimeQuestions('mcpServer/elicitation/request',{mode:'url'}))
})

test('empty MCP approval forms require a real user decision and preserve accept/decline semantics',async()=>{
 const params={mode:'form',message:'Open the selected conversation? This may mark it seen.',requestedSchema:{type:'object',properties:{}}}
 assert.deepEqual(runtimeQuestions('mcpServer/elicitation/request',params),[{id:'confirmation',question:params.message,options:['Allow once','Decline']}])
 for(const [choice,expected] of [['Decline',{action:'decline',content:null}],['Allow once',{action:'accept',content:{}}]]){
   const result=await relayApproval('mcpServer/elicitation/request',params,{job:{id:'job',lease:'lease'},report:async()=>{},api:async(_action,input)=>input.action==='create'?{id:'request',expires_at:new Date(Date.now()+10000).toISOString()}:{answers:{confirmation:choice}}})
   assert.deepEqual(result,expected)
 }
 assert.throws(()=>runtimeQuestions('mcpServer/elicitation/request',{...params,message:''}))
 assert.throws(()=>runtimeQuestions('mcpServer/elicitation/request',{...params,requestedSchema:{type:'string'}}))
})
