import assert from 'node:assert/strict'
import {calendarIntensity} from './dayIntensity.js'
const start=Date.parse('2026-11-18T00:00:00Z'),end=start+86400000
const item=(difficulty:number|null,hours=1)=>({event:{title:'Work',tagIds:[],difficulty},start:new Date(start+7*3600000),end:new Date(start+(7+hours)*3600000)})
const score=(items:any[])=>calendarIntensity(items,[],start,end).score
assert.equal(score([item(100)]),6)
assert.equal(score([item(50)]),5)
assert.equal(score([item(null)]),5)
assert.equal(score([item(100),item(50)]),6)
assert.equal(score([item(50,2)]),10)
console.log('Difficulty weighting, neutral fallback, duration coverage and overlap checks passed')

assert.equal(score([item(-1,8)]),0)
assert.equal(score([item(-1,8),item(100)]),6)
assert.equal(calendarIntensity([item(-1,8)] as any,[],start,end).summary,'0.0h busy · 16.0h downtime')
assert.ok(score([item(1,8)])>score([item(100,1)]))
