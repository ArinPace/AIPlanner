import test from 'node:test'
import assert from 'node:assert/strict'
import { readableSlackImageUrl } from './browser-access.mjs'
import { imageMime, readPageImage } from './image-reader.mjs'
import { chromium } from 'playwright-core'

test('image requests are limited to Slack attachment paths, including after redirects', () => {
  assert.equal(readableSlackImageUrl('https://files.slack.com/files-pri/T1-F1/poster.jpg'),'https://files.slack.com/files-pri/T1-F1/poster.jpg')
  for (const u of ['http://files.slack.com/files-pri/a','https://files.slack.com.evil.test/files-pri/a','https://127.0.0.1/files-pri/a','https://secret@files.slack.com/files-pri/a','https://files.slack.com/api/secret','https://files.slack.com/files-pri/../../api/secret']) assert.throws(()=>readableSlackImageUrl(u))
})
test('login HTML and unsupported files cannot be sent as images', () => {
  assert.equal(imageMime(Buffer.from('<html>Sign in</html>')),null)
  assert.equal(imageMime(Buffer.from('%PDF-1.7')),null)
  assert.equal(imageMime(Buffer.from([255,216,255,224])),'image/jpeg')
  assert.equal(imageMime(Buffer.from([137,80,78,71,13,10,26,10])),'image/png')
})
test('rendered images are returned as real PNG pixels, with an explicit missing-image error', async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true })
  try {
    const context = await browser.newContext(), page = await context.newPage()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="cyan"/><text x="10" y="60">Example poster</text></svg>'
    await page.setContent(`<img alt="Example" src="data:image/svg+xml,${encodeURIComponent(svg)}">`)
    await page.locator('img').evaluate(n=>n.decode())
    const result = { url:'https://example.test', images:[{index:0,alt:'Example'}] }
    const output = await readPageImage(context,page,result,false,0)
    const image = output.content.find(c=>c.type==='image')
    assert.equal(image.mimeType,'image/png')
    assert.equal(imageMime(Buffer.from(image.data,'base64')),'image/png')
    assert.match(output.content[0].text,/rendered image/)
    await assert.rejects(readPageImage(context,page,result,false,1),/Image not found/)
  } finally { await browser.close() }
})
