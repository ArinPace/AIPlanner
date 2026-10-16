import test from 'node:test'
import assert from 'node:assert/strict'
import { browserAccountIdentity, identityFromAccountControl } from './account-identity.mjs'
import { googleAccountLanding, selectedBrowserDestination } from './site-launches.mjs'

test('Google browser account selection persists without cookies or message URLs',()=>{
  const saved={gmail:googleAccountLanding('gmail','https://mail.google.com/mail/u/2/#inbox/private-message')}
  assert.equal(saved.gmail,'https://mail.google.com/mail/u/2/')
  assert.equal(selectedBrowserDestination('https://mail.google.com/mail/u/0/#inbox',saved),'https://mail.google.com/mail/u/2/#inbox')
  assert.equal(selectedBrowserDestination('https://calendar.google.com/calendar/u/0/r',saved),'https://calendar.google.com/calendar/u/0/r')
  assert.equal(googleAccountLanding('gmail','https://mail.google.com.evil.test/mail/u/2/'),null)
  assert.equal(googleAccountLanding('gmail','https://mail.google.com/mail/u/2/?token=secret'),'https://mail.google.com/mail/u/2/')
})

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
