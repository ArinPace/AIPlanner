import test from 'node:test'
import assert from 'node:assert/strict'
import {modelCatalog,generationOptions} from './model-options.mjs'
test('provider metadata bounds options and strips hidden models and arbitrary fields',()=>{
 const rows=modelCatalog([{model:'a',displayName:'Model A',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'not-real'}],serviceTiers:[{id:'fast',name:'Fast'}],token:'never-export'},{model:'b',hidden:true}])
 assert.deepEqual(rows,[{model:'a',label:'Model A',efforts:['high'],tiers:[{id:'fast',label:'Fast'}]}]);assert(!JSON.stringify(rows).includes('never-export'));assert.deepEqual(modelCatalog(rows),rows)
 assert.deepEqual(generationOptions({model:'a',effort:'high',serviceTier:'fast'},rows),{model:'a',effort:'high',serviceTier:'fast'})
 for(const x of [{model:'b'},{model:'a',effort:'ultra'},{model:'a',serviceTier:'premium'},{effort:'high'},{model:'a',extra:true}])assert.throws(()=>generationOptions(x,rows))
 assert.deepEqual(generationOptions({},rows),{});assert.deepEqual(generationOptions({reset:true},rows),{reset:true});assert.throws(()=>generationOptions({reset:true,model:'a'},rows));assert.deepEqual(generationOptions({model:'a',serviceTier:'default'},rows),{model:'a',serviceTier:'default'})
})
