import test from 'node:test'
import assert from 'node:assert/strict'
import {gmailAccountPrompt} from './chatAppAccounts.js'
test('Gmail setup verifies identity and read/write tools without a test write',()=>{const p=gmailAccountPrompt();assert.match(p,/profile tool/);assert.match(p,/read one message header/);assert.match(p,/send, draft, label and archive/);assert.match(p,/do not perform a test write/);assert.match(p,/planner_gmail_account_report/);assert.match(p,/includeInstructions:false/)})
test('adding accounts uses ChatGPT consent and handles one-mailbox limits honestly',()=>{const p=gmailAccountPrompt(true);assert.match(p,/connection\/management interface/);assert.match(p,/wait for my consent/);assert.match(p,/only supports one mailbox/);assert.match(p,/Do not disconnect an existing account without asking/)})
