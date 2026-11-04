import test from 'node:test'
import assert from 'node:assert/strict'
import {planChatMirror,type ChatMirror} from './chatSync.js'
const base:ChatMirror={title:'Homework',archived:false,deleted:false}
test('mirror merges independent edits in both directions',()=>{assert.deepEqual(planChatMirror({...base,title:'Math'},{...base,archived:true},base),{push:{title:'Math'},pull:{archived:true},conflicts:[]})})
test('mirror reports concurrent incompatible renames',()=>{assert.deepEqual(planChatMirror({...base,title:'A'},{...base,title:'B'},base),{push:{},pull:{},conflicts:['title']})})
test('first binding preserves Planner identity and subsequent remote deletion is pulled',()=>{assert.equal(planChatMirror(base,{...base,title:'Auto title'},null).push.title,'Homework');assert.deepEqual(planChatMirror(base,{...base,deleted:true},base).pull,{deleted:true})})
test('a deleted ChatGPT conversation cannot be restored by Planner',()=>{assert.deepEqual(planChatMirror(base,{...base,deleted:true},{...base,deleted:true}).conflicts,['deleted'])})
