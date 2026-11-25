import test from 'node:test'
import assert from 'node:assert/strict'
import {gmailAccountSchema} from './chat-app-accounts.js'
test('account reports validate mailbox and tool names and normalize identity',()=>{assert.equal(gmailAccountSchema.parse({email:'User@Example.com',readVerified:true,writeTools:['gmail_send_email']}).email,'user@example.com');assert.throws(()=>gmailAccountSchema.parse({email:'bad',readVerified:true,writeTools:[]}));assert.throws(()=>gmailAccountSchema.parse({email:'u@example.com',readVerified:true,writeTools:['private text with spaces']}))})
