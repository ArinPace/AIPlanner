import assert from 'node:assert/strict'
import {calendarIntensity} from './dayIntensity.js'
const start=Date.parse('2026-11-18T00:00:00Z'),end=start+86400000
const item=(difficulty:number|null,hours=1)=>({event:{title:'Work',tagIds:[],difficulty},start:new Date(start+7*3600000),end:new Date(start+(7+hours)*3600000)})
const score=(items:any[])=>calendarIntensity(items,[],start,end).score
assert.ok(score([item(100)])>=7)
assert.equal(score([item(50)]),8)
assert.equal(score([item(null)]),8)
assert.equal(score([item(100),item(50)]),8)
assert.equal(score([item(50,2)]),15)
console.log('Difficulty weighting, neutral fallback, duration coverage and overlap checks passed')

assert.equal(score([item(-1,8)]),0)
assert.equal(score([item(-1,8),item(100)]),13)
assert.equal(calendarIntensity([item(-1,8)] as any,[],start,end).summary,'0.0h busy · 8.0h downtime')
assert.ok(score([item(1,8)])>score([item(100,1)]))

const sleep={event:{title:'WHOOP — recorded sleep interval, November 18',tagIds:[]},start:new Date(start),end:new Date(start+7*3600000)}
assert.equal(calendarIntensity([sleep] as any,[],start,end).summary,'0.0h busy · 17.0h downtime')
assert.equal(calendarIntensity([sleep,item(-1,8)] as any,[],start,end).summary,'0.0h busy · 9.0h downtime')

assert.equal(score([item(0,8)]),0)
assert.equal(calendarIntensity([item(0,8)] as any,[],start,end).summary,'0.0h busy · 16.0h downtime')
assert.equal(score([item(0,8),item(100)]),8)

const shifted=(difficulty:number,hours:number,offsetHours:number)=>{const value=item(difficulty,hours);return {...value,start:new Date(value.start.getTime()+offsetHours*3600000),end:new Date(value.end.getTime()+offsetHours*3600000)}}
const result=(items:any[])=>calendarIntensity(items,[],start,end)
assert.equal(result([item(50)]).continuityPenaltyPoints,0)
assert.equal(result([item(50,2)]).longestContinuousBusyMinutes,120)
assert.ok(result([item(50,2)]).continuityPenaltyPoints>0)
assert.equal(score([item(50),shifted(50,1,1)]),score([item(50,2)]))
assert.equal(result([item(50),shifted(50,1,1.25)]).continuityPenaltyPoints,0)
assert.equal(result([item(50),shifted(0,.25,1),shifted(50,1,1.25)]).longestContinuousBusyMinutes,60)
assert.equal(result([item(50),shifted(-1,.25,1),shifted(50,1,1.25)]).continuityPenaltyPoints,0)
assert.ok(score([item(100,16)])<=100)

const classDay=result([item(70,12.8)])
assert.ok(classDay.score>=78&&classDay.score<=83)
assert.ok(classDay.continuityPenaltyPoints<=2)
assert.ok(Math.abs(score([item(100,8)])-score([item(1,8)]))<=3)
assert.ok(Math.abs(score([item(50,8)])-score([item(50,4),shifted(50,4,5)]))<=2)
