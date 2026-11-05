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
 for(const term of ['homework/assignments','quizzes','tests/exams','recordings','recitations','Grades and A-track','actual graded denominator','ungraded work as zero','scheduled reviews refresh all active subjects'])assert(prompt.includes(term),term)
})
