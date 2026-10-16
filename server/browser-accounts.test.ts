import test from 'node:test'
import assert from 'node:assert/strict'
import { accountIdentity } from './browser-accounts.js'

test('account metadata is bounded plain text',()=>{
  assert.equal(accountIdentity(' user@example.com '),'user@example.com')
  for(const value of [undefined,null,{},'', ' ', '<script>', 'name\nsecret', 'x'.repeat(201)])assert.equal(accountIdentity(value),null)
})
