import test from 'node:test'
import assert from 'node:assert/strict'
import {sourceConnectionPrompt} from './sourceConnectionPrompt.js'
test('Gmail requests API identity and a verified read, retaining consent and mailbox modification boundaries',()=>{
 const prompt=sourceConnectionPrompt('gmail')
 assert.match(prompt,/real Gmail API/);assert.match(prompt,/verify the exact mailbox identity/);assert.match(prompt,/read one message header/)
 assert.match(prompt,/wait for OAuth consent/);assert.match(prompt,/preserving every other enabled source/)
 assert.match(prompt,/Do not send, draft, label, archive, delete/);assert(!prompt.startsWith('Open https://mail.google.com'))
})
test('other sources retain their secure browser connection flow',()=>{assert.match(sourceConnectionPrompt('brightspace'),/^Open https:\/\/brightspace.nyu.edu/);assert.match(sourceConnectionPrompt('brightspace'),/private secure sign-in form/)})
