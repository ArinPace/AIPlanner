import test from 'node:test'
import assert from 'node:assert/strict'
import {layoutTimeCards} from '../src/lib/timeLayout.js'

test('only connected overlapping groups share columns; later isolated cards use full width',()=>{
  const result=layoutTimeCards([{id:'a',top:0,bottom:60},{id:'b',top:30,bottom:90},{id:'c',top:60,bottom:100},{id:'later',top:200,bottom:240}])
  assert.deepEqual(result.map(({id,col,cols})=>({id,col,cols})),[{id:'a',col:0,cols:2},{id:'b',col:1,cols:2},{id:'c',col:0,cols:2},{id:'later',col:0,cols:1}])
})
test('expanded short cards avoid visually covering the next event and exact boundaries reuse a column',()=>{
  const result=layoutTimeCards([{id:'short-wrapped',top:0,bottom:100},{id:'next',top:20,bottom:60},{id:'boundary',top:100,bottom:130}])
  assert.equal(result[0].cols,2)
  assert.equal(result[1].col,1)
  assert.equal(result[2].cols,1)
  assert.deepEqual(layoutTimeCards([]),[])
})

test('a long sequence of fractional-minute adjacent blocks stays full width',()=>{
 const blocks=Array.from({length:20},(_,i)=>({top:100+i*21.6,bottom:100+(i+1)*21.6+Number.EPSILON*1000}))
 assert.ok(layoutTimeCards(blocks).every(item=>item.col===0&&item.cols===1))
})
