import test from 'node:test'
import assert from 'node:assert/strict'
import {ResourceCache} from './resource-cache.js'
test('warm resources coalesce loads, isolate owner keys and expire/evict without disposing active readers',async()=>{
 let now=0,loads=0,disposed=0
 const cache=new ResourceCache<number>(10,2,100,()=>now),load=async()=>({value:++loads,bytes:6,dispose:()=>{disposed++}}),read=async(n:number)=>n
 assert.deepEqual(await Promise.all([cache.use('alice:pdf',load,read),cache.use('alice:pdf',load,read)]),[1,1]);assert.equal(loads,1)
 assert.equal(await cache.use('bob:pdf',load,read),2);assert.equal(disposed,1)
 let release!:()=>void
 const waiting=cache.use('bob:pdf',load,async n=>{await new Promise<void>(r=>release=r);return n})
 await new Promise(r=>setTimeout(r,0));now=200
 await cache.use('carol:pdf',load,read);assert.equal(disposed,2,'new idle resource is evicted while the older resource is in use')
 release();await waiting
 now=400;await cache.use('bob:pdf',load,read);assert.equal(loads,4);assert.equal(disposed,3)
})
test('failed loads can recover; read failures retain a valid resource for later ranges',async()=>{
 const cache=new ResourceCache<number>();let loads=0
 await assert.rejects(()=>cache.use('owner:pdf',async()=>{throw Error('Unavailable')},async n=>n),/Unavailable/)
 const load=async()=>({value:++loads,bytes:1,dispose:()=>{}})
 await assert.rejects(()=>cache.use('owner:pdf',load,async()=>{throw Error('Page out of range')}),/Page out of range/)
 assert.equal(await cache.use('owner:pdf',load,async n=>n),1);assert.equal(loads,1)
})
