import test from 'node:test'
import assert from 'node:assert/strict'
import {PlannerDate} from './timezone.js'
import {timelineBounds} from './dayTimeline.js'
import type {Occurrence} from '../types.js'
const row=(start:string,end:string)=>({start:new PlannerDate(start),end:new PlannerDate(end),event:{}} as Occurrence)
test('time ruler aligns local clock times and clips overnight events at each day boundary',()=>{
 const day=new PlannerDate('2026-11-23T12:00:00-05:00')
 assert.deepEqual(timelineBounds(row('2026-11-23T08:15:00-05:00','2026-11-23T09:45:00-05:00'),day),{start:495,end:585})
 assert.deepEqual(timelineBounds(row('2026-11-22T22:00:00-05:00','2026-11-23T06:30:00-05:00'),day),{start:0,end:390})
 assert.deepEqual(timelineBounds(row('2026-11-23T22:00:00-05:00','2026-11-24T06:30:00-05:00'),day),{start:1320,end:1440})
 assert.deepEqual(timelineBounds(row('2026-11-23T10:00:00-05:00','2026-11-23T10:00:00-05:00'),day),{start:600,end:600})
})
