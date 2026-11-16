import test from 'node:test'
import assert from 'node:assert/strict'
import {whoopBackgroundIds,isWhoopBackground} from '../src/lib/whoopBackground.js'
test('only generated WHOOP prompts and their replies move into background activity',()=>{
 const messages=[{id:'1',role:'user',content:'Can WHOOP help with planning?'},{id:'2',role:'assistant',content:'Foreground reply'},{id:'3',role:'user',content:'Scheduled WHOOP sleep check'},{id:'4',role:'assistant',content:'Background result'},{id:'5',role:'user',content:'My next question'},{id:'6',role:'assistant',content:'Foreground answer'}]
 assert.deepEqual([...whoopBackgroundIds(messages)],['3','4'])
 assert(isWhoopBackground('WHOOP BACKGROUND UPDATE. Read new data.'))
 assert(!isWhoopBackground('Scheduled planner review'))
})
