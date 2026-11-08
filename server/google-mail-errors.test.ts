import test from 'node:test'
import assert from 'node:assert/strict'
import {googleMailFailure} from './google-mail.js'
test('Google email failures distinguish disabled service, consent, rate limits and unknown policy without echoing payloads',async()=>{
 const failure=(reason:string,status=403)=>googleMailFailure(Response.json({error:{message:'private response value',details:[{reason}]}},{status}))
 assert.match((await failure('SERVICE_DISABLED')).message,/Enable Gmail API/)
 assert.match((await failure('ACCESS_TOKEN_SCOPE_INSUFFICIENT')).message,/required Gmail scope/)
 assert.match((await failure('RATE_LIMIT_EXCEEDED',429)).message,/rate-limited/)
 assert.match((await failure('UNKNOWN')).message,/not proof of a website logout/)
 assert(!(await failure('UNKNOWN')).message.includes('private response value'))
})
