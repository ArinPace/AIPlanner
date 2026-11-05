import {z} from 'zod'
import {db,ApiError} from './cloud.js'
import {storage} from './mcp-auth.js'
import {SUBJECT_LIFECYCLE} from '../worker/subject-lifecycle.mjs'
export async function readSubjectRollover(username:string){
 const row=storage(await db().from('planner_subject_rollovers').select('*').eq('username',username).maybeSingle())
 return {nextAt:row?.next_at||null,basis:row?.basis||'',sources:row?.sources||[],revision:Number(row?.revision||0),lastJobId:row?.last_job_id||null,lastQueuedAt:row?.last_queued_at||null,timezone:'America/New_York',needsNextDate:Boolean(row?.next_at&&row?.last_queued_at&&Date.parse(row.last_queued_at)>=Date.parse(row.next_at))}
}
export async function scheduleSubjectRollover(username:string,input:unknown){
 const args=z.object({expectedRevision:z.number().int().nonnegative(),runAt:z.string().datetime({offset:true}).nullable(),basis:z.string().trim().min(1).max(4000),sources:z.array(z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password})).min(1).max(10)}).strict().parse(input)
 if(args.runAt&&Date.parse(args.runAt)<=Date.now())throw new ApiError(400,'Choose a future turnover time with an explicit timezone.')
 storage(await db().from('planner_subject_rollovers').upsert({username},{onConflict:'username',ignoreDuplicates:true}))
 const rows=storage(await db().from('planner_subject_rollovers').update({next_at:args.runAt,basis:args.basis,sources:args.sources,revision:args.expectedRevision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',args.expectedRevision).select('username'))
 if(!rows.length)throw new ApiError(409,'Subject turnover changed. Read the latest schedule and retry.')
 return readSubjectRollover(username)
}
export function subjectRolloverMessage(){return 'RUN THE SCHEDULED SUBJECT TURNOVER NOW. Read planner_subject_rollover_read, verify its official date evidence, and perform the subject-folder handoff. This is not a general calendar replan: do not check unrelated sources or change calendar/task state. If the saved basis starts with Setup, only research and book the real future handoff; do not retire current courses during setup. '+SUBJECT_LIFECYCLE+'\nAlways call planner_subject_rollover_schedule before finishing, including a researched retry date if enrollment or source access is unresolved. Report what changed and the next booked date. Never delete old materials or chat history.'}
