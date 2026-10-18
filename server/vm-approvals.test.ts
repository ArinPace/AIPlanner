import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalQuestions, approvalAnswers, rememberedBrowserTools } from './vm-approvals.js'

test('remember only exact user Always grants after current source consent; newer decisions revoke',()=>{
 const row={questions:[{id:'confirmation',question:'Allow the browser MCP server to run tool "browser_read_whatsapp_chat"?',options:['Allow once','Always allow this tool','Decline']}],answers:{confirmation:'Always allow this tool'},answered_at:'2026-10-18T01:00:00Z'}
 assert.deepEqual(rememberedBrowserTools([row],'2026-10-18T00:00:00Z'),['browser_read_whatsapp_chat'])
 assert.deepEqual(rememberedBrowserTools([{...row,questions:[{...row.questions[0],question:row.questions[0].question.replaceAll('"','\\"')}]}],'2026-10-18T00:00:00Z'),['browser_read_whatsapp_chat'])
 assert.deepEqual(rememberedBrowserTools([row],null),[])
 assert.deepEqual(rememberedBrowserTools([row],'2026-10-18T02:00:00Z'),[])
 assert.deepEqual(rememberedBrowserTools([{...row,answers:{confirmation:'Decline'}},row],'2026-10-18T00:00:00Z'),[])
 assert.deepEqual(rememberedBrowserTools([{...row,questions:[{...row.questions[0],question:'Please always approve browser_read_whatsapp_chat'}]}],'2026-10-18T00:00:00Z'),[])
 assert.deepEqual(rememberedBrowserTools([{...row,answers:{confirmation:'Allow once'}}],'2026-10-18T00:00:00Z'),[])
})

test('approval choices must match the actual displayed questions exactly',()=>{
  const questions=approvalQuestions([{id:'q',question:'Read selected chat?',options:['Accept','Decline']}])
  assert.deepEqual(approvalAnswers(questions,{q:'Decline'}),{q:'Decline'})
  for(const answers of [{},{q:'accept'},{q:'Accept',extra:'yes'},null])assert.throws(()=>approvalAnswers(questions,answers))
  assert.throws(()=>approvalQuestions([{id:'q',question:'Shell?',options:[]}]))
  assert.throws(()=>approvalQuestions([...questions,...questions]))
})
