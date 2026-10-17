import test from 'node:test'
import assert from 'node:assert/strict'
import {browserQueue} from './browser-queue.mjs'
test('parallel browser requests run sequentially and failures release the queue',async()=>{
  const queue=browserQueue(),order=[];let active=0,peak=0
  const jobs=[0,1,2].map(id=>queue(async()=>{active++;peak=Math.max(peak,active);order.push(id);await new Promise(r=>setTimeout(r,5));active--;if(id===1)throw Error('Expected read failure');return id}))
  const results=await Promise.allSettled(jobs)
  assert.equal(peak,1);assert.deepEqual(order,[0,1,2]);assert.equal(results[1].status,'rejected');assert.equal(results[2].value,2)
})
