import test from 'node:test'
import assert from 'node:assert/strict'
import { runtimeQuestions, relayApproval, approvalPersistence } from './approval-bridge.mjs'

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

test('remembered approvals are offered and returned only when the runtime advertises that scope',async()=>{
 const params={mode:'form',message:'Allow selected message reader?',requestedSchema:{type:'object',properties:{}},_meta:{codex_approval_kind:'mcp_tool_call',persist:['session','always']}}
 assert.deepEqual(runtimeQuestions('mcpServer/elicitation/request',params)[0].options,['Allow once','Allow for this session','Always allow this tool','Decline'])
 assert.deepEqual(approvalPersistence({...params,_meta:{persist:'always'}}),[])
 const result=await relayApproval('mcpServer/elicitation/request',params,{job:{id:'job',lease:'lease'},report:async()=>{},api:async(_action,input)=>input.action==='create'?{id:'request',expires_at:new Date(Date.now()+10000).toISOString()}:{answers:{confirmation:'Always allow this tool'}}})
 assert.deepEqual(result,{action:'accept',content:{},_meta:{persist:'always'}})
 const denied=await relayApproval('mcpServer/elicitation/request',{...params,_meta:null},{job:{id:'job',lease:'lease'},report:async()=>{},api:async(_action,input)=>input.action==='create'?{id:'request',expires_at:new Date(Date.now()+10000).toISOString()}:{answers:{confirmation:'Always allow this tool'}}})
 assert.deepEqual(denied,{action:'decline',content:null})
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

test('command and file approvals relay actual user decisions without inventing persistent grants',async()=>{
 for(const method of ['item/commandExecution/requestApproval','item/fileChange/requestApproval']){
  const params={itemId:'item',threadId:'thread',turnId:'turn',command:'node --test monitor.test.mjs',cwd:'/workspace',grantRoot:'/workspace/monitors',availableDecisions:['accept','decline','cancel']}
  const question=runtimeQuestions(method,params)[0];assert(question.question.includes(method.includes('command')?'node --test':'/workspace/monitors'))
  for(const [choice,decision] of [['Allow once','accept'],['Decline','decline'],['Cancel task','cancel'],['Allow for this session','decline']]){
   const result=await relayApproval(method,params,{wait:async()=>{},job:{id:'job',lease:'lease'},report:async()=>{},api:async(_a,input)=>input.action==='create'?{id:'approval',expires_at:new Date(Date.now()+60000).toISOString()}:{answers:{runtime:choice}}})
   assert.deepEqual(result,{decision})
  }
 }
 const params={itemId:'item',threadId:'thread',turnId:'turn',command:'node monitor.mjs',availableDecisions:['acceptForSession','decline']}
 assert.deepEqual(runtimeQuestions('item/commandExecution/requestApproval',params)[0].options,['Allow for this session','Decline','Cancel task'])
})

test('permission requests expose exact scopes and grant only the explicitly chosen turn',async()=>{
 const params={itemId:'item',threadId:'thread',turnId:'turn',cwd:'/workspace',permissions:{network:{enabled:true},fileSystem:{write:['/workspace/monitors']}}}
 assert(runtimeQuestions('item/permissions/requestApproval',params)[0].question.includes('/workspace/monitors'))
 for(const [choice,permissions] of [['Allow for this turn',params.permissions],['Decline',{}],['Allow for this session',{}]]){
  const result=await relayApproval('item/permissions/requestApproval',params,{wait:async()=>{},job:{id:'job',lease:'lease'},report:async()=>{},api:async(_a,input)=>input.action==='create'?{id:'approval',expires_at:new Date(Date.now()+60000).toISOString()}:{answers:{permissions:choice}}})
  assert.deepEqual(result,{permissions,scope:'turn'})
 }
 assert.throws(()=>runtimeQuestions('item/permissions/requestApproval',{...params,permissions:{macos:{}}}))
})
