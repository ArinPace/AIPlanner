import test from 'node:test'
import assert from 'node:assert/strict'
import {googleMailFailure} from './google-mail.js'
test('Google email failures distinguish disabled service, consent, rate limits and unknown policy without echoing payloads',async()=>{
 const failure=(reason:string,status=403)=>googleMailFailure(Response.json({error:{message:'private response value',details:[{reason}]}},{status}))
 assert.match((await failure('SERVICE_DISABLED')).message,/Enable Gmail API/)
 const disabled=await googleMailFailure(Response.json({error:{details:[{reason:'SERVICE_DISABLED',metadata:{activationUrl:'https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=123456'}}]}},{status:403}))
 assert(disabled.message.includes('https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=123456'))
 const unsafe=await googleMailFailure(Response.json({error:{details:[{reason:'SERVICE_DISABLED',metadata:{activationUrl:'https://evil.example/secret-token'}}]}},{status:403}))
 assert(!unsafe.message.includes('evil.example'));assert(!unsafe.message.includes('secret-token'))
 assert.match((await failure('ACCESS_TOKEN_SCOPE_INSUFFICIENT')).message,/required Gmail scope/)
 assert.match((await failure('RATE_LIMIT_EXCEEDED',429)).message,/rate-limited/)
 assert.match((await failure('UNKNOWN')).message,/not proof of a website logout/)
 assert(!(await failure('UNKNOWN')).message.includes('private response value'))
})
