import test from 'node:test'
import assert from 'node:assert/strict'
import {effectiveInstructions} from './live-instructions.mjs'
test('live personal rules are in the actual prompt; clearing supersedes old resumed rules',()=>{
 const updated=effectiveInstructions('Built-in planner rules',{revision:2,content:'Plan errands on Friday.'})
 assert.match(updated,/Built-in planner rules/);assert.match(updated,/revision 2/);assert.match(updated,/Plan errands on Friday/);assert.match(updated,/do not grant new permissions/)
 const cleared=effectiveInstructions('Built-in planner rules',{revision:3,content:''})
 assert.match(cleared,/Previously configured personal instructions are cleared/);assert.doesNotMatch(cleared,/Plan errands on Friday/)
})

test('Tutor maintenance is included in real runtime rules without truncating personal instructions',()=>{
 const personal='P'.repeat(19970),prompt=effectiveInstructions('Tutor enabled for this account: yes',{revision:30,content:personal})
 assert(prompt.includes(personal))
 for(const term of ['homework/assignments','quizzes','tests/exams','recordings','recitations','Grades and A-track','actual graded denominator','ungraded work as zero','Main Chat and its ordinary scheduled subject reviews must read','must not edit, reorganize, download into, or refresh','Only the corresponding Tutor conversation','separately booked subject-turnover automation'])assert(prompt.includes(term),term)
})

 test('interactive browser permission is explicit, account-scoped and supersedes old blanket write bans',()=>{
 const old='Never send messages. Source websites are read-only.'
 const standard=effectiveInstructions('base',{content:old})
 assert(!standard.includes('Interactive browser control is enabled'))
 const enabled=effectiveInstructions('base',{content:old},{browserControl:true})
 assert(enabled.indexOf('Interactive browser control is enabled')>enabled.indexOf(old))
 for(const term of ['browser_screenshot','browser_action','may send messages','user-requested task','not an instruction to send unrelated messages'])assert(enabled.includes(term),term)
 })

 test('user-facing Subjects library is a top-level exception to Agent output placement',()=>{
 const text=effectiveInstructions('base',{revision:1,content:'Old instruction: put Subjects under Agent.'})
 assert.match(text,/Subjects library at Files root, never under Agent/)
 assert(text.lastIndexOf('must remain in top-level Files/Subjects')>text.indexOf('Old instruction:'))
 })

test('Tutor grade trackers stay compact and syllabuses use original Brightspace PDFs',()=>{
 const text=effectiveInstructions('base',{content:''})
 for(const term of ['Component | Weight | Current score','Current estimated grade','No essays','original official PDF','Brightspace','never manufacture a PDF from notes'])assert(text.includes(term),term)
})
