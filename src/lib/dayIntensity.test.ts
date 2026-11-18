import assert from 'node:assert/strict'
import {calendarIntensity} from './dayIntensity.js'
const start=Date.parse('2026-11-18T00:00:00Z'),end=start+86400000
const item=(difficulty:number|null,hours=1)=>({event:{title:'Work',tagIds:[],difficulty},start:new Date(start+7*3600000),end:new Date(start+(7+hours)*3600000)})
const score=(items:any[])=>calendarIntensity(items,[],start,end).score
assert.equal(score([item(100)]),6)
assert.equal(score([item(50)]),3)
assert.equal(score([item(null)]),3)
assert.equal(score([item(100),item(50)]),6)
assert.equal(score([item(50,2)]),6)
console.log('Difficulty weighting, neutral fallback, duration coverage and overlap checks passed')
