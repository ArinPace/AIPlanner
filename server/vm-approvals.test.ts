import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalQuestions, approvalAnswers } from './vm-approvals.js'

test('approval choices must match the actual displayed questions exactly',()=>{
  const questions=approvalQuestions([{id:'q',question:'Read selected chat?',options:['Accept','Decline']}])
  assert.deepEqual(approvalAnswers(questions,{q:'Decline'}),{q:'Decline'})
  for(const answers of [{},{q:'accept'},{q:'Accept',extra:'yes'},null])assert.throws(()=>approvalAnswers(questions,answers))
  assert.throws(()=>approvalQuestions([{id:'q',question:'Shell?',options:[]}]))
  assert.throws(()=>approvalQuestions([...questions,...questions]))
})
