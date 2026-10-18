import test from 'node:test'
import assert from 'node:assert/strict'
import {branchInput} from './branch-input.mjs'

const text={id:'file',name:'context.txt',kind:'text',size:12,data:'data:text/plain;base64,Y29udGV4dA==',text:'EARLY_FILE38',coverage:'Full text'}
test('legacy branches replay only the saved cutoff transcript and attachment text',()=>{
 const job={branch_history:[{message:'EARLY57',reply:'Saved early',status:'completed',attachments:[text]},{message:'Interrupted request',reply:'Partial work',status:'cancelled',attachments:[]}]}
 const output=branchInput(job,'NEWEST INSTRUCTION')
 const encoded=JSON.stringify(output)
 assert.match(encoded,/EARLY57/);assert.match(encoded,/EARLY_FILE38/);assert.match(encoded,/partial\/interrupted/);assert.match(encoded,/later messages are deliberately excluded/)
 assert.match(output.at(-1).text,/NEWEST INSTRUCTION/)
})
test('native checkpoint forks avoid replaying old attachments, while Claude fallback retains them',()=>{
 const job={branch_history:[{message:'Historical message',reply:'Old response',status:'completed',attachments:[text]}],attachment_payload:[]}
 const native=JSON.stringify(branchInput(job,'Follow-up',{nativeHistory:true}))
 assert.doesNotMatch(native,/Historical message|EARLY_FILE38/)
 const claude=JSON.stringify(branchInput(job,'Follow-up',{claude:true}))
 assert.match(claude,/EARLY_FILE38/);assert.match(claude,/Follow-up/)
})
