import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionMode, shouldConfirm } from './connection-mode.mjs'

test('opening an expired session becomes sign-in, while an authenticated site stays open',()=>{
  assert.equal(connectionMode('open',false),'connect')
  assert.equal(connectionMode('open',true),'open')
  assert.equal(connectionMode('connect',true),'connect')
  assert.equal(shouldConfirm('connect',null,null),true)
})
test('account management waits for a changed account instead of confirming the old login',()=>{
  assert.equal(connectionMode('manage',true),'manage')
  assert.equal(connectionMode('manage',false),'connect')
  assert.equal(shouldConfirm('manage','old@example.com','old@example.com'),false)
  assert.equal(shouldConfirm('manage','old@example.com',null),false)
  assert.equal(shouldConfirm('manage','old@example.com','new@example.com'),true)
})
