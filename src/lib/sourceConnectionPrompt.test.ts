import test from 'node:test'
import assert from 'node:assert/strict'
import {sourceConnectionPrompt} from './sourceConnectionPrompt.js'
test('Gmail requests API identity and a verified read, retaining consent and mailbox modification boundaries',()=>{
 const prompt=sourceConnectionPrompt('gmail')
 assert.match(prompt,/connected Gmail MCP\/app tools/);assert.match(prompt,/Verify the exact mailbox identity/);assert.match(prompt,/read one message header/)
 assert.match(prompt,/setup alone does not authorize/);assert.match(prompt,/preserving every other source/)
 assert.match(prompt,/do not perform a test write/);assert(!prompt.startsWith('Open https://mail.google.com'))
})
test('other sources retain their secure browser connection flow',()=>{assert.match(sourceConnectionPrompt('brightspace'),/^Open https:\/\/brightspace.nyu.edu/);assert.match(sourceConnectionPrompt('brightspace'),/private secure sign-in form/)})
