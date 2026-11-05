import test from 'node:test'
import assert from 'node:assert/strict'
import {clientControlSchema} from '../src/lib/clientControlSchema.js'
test('native blocking configuration requires an explicit complete policy and known-shaped group IDs',()=>{
 const command={action:'screen_time_configure',expected:'a'.repeat(64),groupIds:['11111111-1111-4111-8111-111111111111'],allApps:false,domains:['youtube.com'],allWebsites:false,allowedDomains:[]}
 assert.equal(clientControlSchema.safeParse(command).success,true)
 assert.equal(clientControlSchema.safeParse({...command,groupIds:['Social media']}).success,false)
 assert.equal(clientControlSchema.safeParse({...command,expected:undefined}).success,false)
 assert.equal(clientControlSchema.safeParse({...command,allApps:undefined}).success,false)
 assert.equal(clientControlSchema.safeParse({...command,domains:Array(51).fill('example.com')}).success,false)
 assert.equal(clientControlSchema.safeParse({...command,token:'must-not-accept-opaque-tokens'}).success,false)
 assert.equal(clientControlSchema.safeParse({...command,groupIds:[],allApps:true,allWebsites:true}).success,true)
})
