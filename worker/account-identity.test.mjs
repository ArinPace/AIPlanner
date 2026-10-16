import test from 'node:test'
import assert from 'node:assert/strict'
import { browserAccountIdentity, identityFromAccountControl } from './account-identity.mjs'

test('identity uses account controls and never searches message content',async()=>{
  assert.equal(identityFromAccountControl('Google Account: Example (EXAMPLE@gmail.com)'),'example@gmail.com')
  assert.equal(identityFromAccountControl('Example\n@some_user'),'@some_user')
  assert.equal(identityFromAccountControl('Open user menu'),null)
  let selector=''
  const page={frames:()=>[{locator:s=>{selector=s;return {evaluateAll:async()=>['Google Account: Example (example@gmail.com)']}}}]}
  assert.equal(await browserAccountIdentity('calendar',page),'example@gmail.com')
  assert.ok(selector.includes('Google Account'))
  assert.ok(!selector.includes('body'))
  assert.equal(await browserAccountIdentity('unknown',page),null)
})
