import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {automaticImageSize} from './automatic-image-size.mjs'
test('automatic image pixels are bounded while originals remain available separately',async()=>{
  const bytes=await sharp({create:{width:3000,height:6000,channels:3,background:'#fff'}}).png().toBuffer()
  const original={type:'image',data:bytes.toString('base64'),mimeType:'image/png'}
  const fitted=await automaticImageSize(original)
  const meta=await sharp(Buffer.from(fitted.data,'base64')).metadata()
  assert.equal(meta.height,2400);assert.equal(meta.width,1200);assert.equal(original.mimeType,'image/png')
})
