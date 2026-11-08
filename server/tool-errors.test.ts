import test from 'node:test'
import assert from 'node:assert/strict'
import {z} from 'zod'
import {plannerToolError} from './tool-errors.js'
import {ApiError} from './cloud.js'
test('tool validation reports paths and requirements without logging payloads or raw exceptions',()=>{
 const parsed=z.object({events:z.array(z.object({title:z.string().max(5)}))}).safeParse({events:[{title:'private confidential text'}]})
 assert(!parsed.success)
 const message=plannerToolError(parsed.error)
 assert.match(message,/events.0.title/);assert.match(message,/5/);assert(!message.includes('confidential'))
 assert.equal(plannerToolError(new ApiError(404,'Draft event not found. Omit id to add an event.')),'Draft event not found. Omit id to add an event.')
 assert(!plannerToolError(new Error('password=secret')).includes('secret'))
})
