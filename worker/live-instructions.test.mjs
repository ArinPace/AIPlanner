import test from 'node:test'
import assert from 'node:assert/strict'
import {effectiveInstructions} from './live-instructions.mjs'
test('live personal rules are in the actual prompt; clearing supersedes old resumed rules',()=>{
 const updated=effectiveInstructions('Built-in planner rules',{revision:2,content:'Plan errands on Friday.'})
 assert.match(updated,/Built-in planner rules/);assert.match(updated,/revision 2/);assert.match(updated,/Plan errands on Friday/);assert.match(updated,/do not grant new permissions/)
 const cleared=effectiveInstructions('Built-in planner rules',{revision:3,content:''})
 assert.match(cleared,/Previously configured personal instructions are cleared/);assert.doesNotMatch(cleared,/Plan errands on Friday/)
})
