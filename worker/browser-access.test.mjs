import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedLivePath, readableUrl } from './browser-access.mjs'
import { tomlValue } from './config-args.mjs'
test('Codex configuration uses TOML inline tables for lease-bound MCP headers', () => {
  assert.equal(tomlValue({ 'X-Planner-Job': 'job', 'X-Planner-Lease': 'lease' }), '{"X-Planner-Job"="job","X-Planner-Lease"="lease"}')
})
test('private browser gateway rejects missing, wrong and traversal tokens', () => {
  const token = 'a'.repeat(32)
  assert.equal(allowedLivePath('/' + token + '/vnc.html', token), true)
  assert.equal(allowedLivePath('/' + token + '/websockify', token), true)
  for (const url of ['/vnc.html', '/wrong/vnc.html', '/' + token + '/../vnc.html']) assert.equal(allowedLivePath(url, token), false)
})
test('agent browser allows only enabled read-only public HTTPS destinations', () => {
  const sources = { brightspace: 'https://brightspace.nyu.edu/', gmail: 'https://mail.google.com/' }
  assert.equal(readableUrl('https://brightspace.nyu.edu/d2l/home/123', ['brightspace'], sources), 'https://brightspace.nyu.edu/d2l/home/123')
  const assignment = 'https://brightspace.nyu.edu/d2l/lms/dropbox/user/folder_submit_files.d2l?db=123&ou=456'
  assert.equal(readableUrl(assignment, ['brightspace'], sources), assignment)
  assert.throws(() => readableUrl(assignment + '&action=submit', ['brightspace'], sources))
  assert.throws(() => readableUrl(assignment, ['gmail'], sources))
  for (const url of ['http://127.0.0.1', 'file:///etc/passwd', 'https://mail.google.com/', 'https://brightspace.nyu.edu.evil.test/', 'https://secret:password@brightspace.nyu.edu/', 'https://brightspace.nyu.edu/logout']) assert.throws(() => readableUrl(url, ['brightspace'], sources))
})
test('authenticated Albert portal is readable only when Albert is enabled',()=>{
 const sources={albert:'https://albert.nyu.edu/'}
 const url='https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/'
 assert.equal(readableUrl(url,['albert'],sources),url)
 for(const href of [url,'https://sis.portal.nyu.edu.evil.test/'])assert.throws(()=>readableUrl(href,[],sources))
 assert.throws(()=>readableUrl('https://sis.portal.nyu.edu.evil.test/',['albert'],sources))
})
