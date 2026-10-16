import test from 'node:test'
import assert from 'node:assert/strict'
import { browserEndpoint } from './browser-routing.mjs'
import { readableUrl } from './browser-access.mjs'

test('Google sources use the separate stable profile and cannot redirect other sites into it',()=>{
  const sources={calendar:'https://calendar.google.com/',slack:'https://app.slack.com/'}
  assert.equal(browserEndpoint(readableUrl('https://calendar.google.com/calendar/u/1/r',['calendar'],sources)),'http://127.0.0.1:9223')
  assert.equal(browserEndpoint(readableUrl('https://app.slack.com/client/ABC/DEF',['slack'],sources)),'http://127.0.0.1:9222')
  assert.throws(()=>readableUrl('https://calendar.google.com.evil.test/',['calendar'],sources))
  assert.throws(()=>readableUrl('https://calendar.google.com/calendar/u/1/r',['slack'],sources))
})
