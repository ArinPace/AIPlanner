import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
export const WHOOP_RETRY_INSTRUCTIONS=`WHOOP sleep freshness is mandatory on every scheduled review when WHOOP is enabled. Read planner_whoop_review_read, inspect the authorized WHOOP browser for the latest relevant sleep date and sync/processing state, and report with planner_whoop_review_report. Missing, stale or processing sleep data means pending, never proof of current wake/sleep. Record the displayed source URL, timezone, sleep start/end, actual sleep minutes (distinct from time in bed), and what was verified. Use status pending while waiting; the scheduler retries hourly without changing ordinary review times. If signed out or inaccessible, report blocked and planner_source_report; do not repeatedly request sign-in/MFA. Continue independent urgent academic work. When fresh data arrives, read current calendar, task feedback and fixed commitments; reconcile actual sleep/wake and the remaining day in one staged revision, read back the published calendar, then report status fresh with reconciled:true. If fresh completed metrics are visible but exact endpoints are unavailable, report fresh with sleepDate, actualSleepMinutes, exact dated sleep-detail sourceUrl and reconciled:false; omit unverified endpoints. Heart-rate samples are not exact sleep boundaries. If reconciliation failed or planning is not activated, report fresh with reconciled:false so the hourly follow-up remains. Preserve fixed classes/exams/appointments and surface infeasible clashes. Never claim a scheduled retry or successful sync without reading the saved WHOOP review state. Chat relay retries require Planner open; do not claim unattended subscription execution.`
export const whoopRetryMessage=()=> 'HOURLY WHOOP SLEEP FOLLOW-UP. Check whether the pending sleep record is now live, and reconcile the calendar only from verified evidence. Do not run unrelated source-library maintenance.\n\n'+WHOOP_RETRY_INSTRUCTIONS
const channelSchema=z.enum(['agent','chat'])
export const whoopReportSchema=z.object({channel:channelSchema,expectedUpdatedAt:z.string().datetime({offset:true}),status:z.enum(['pending','fresh','blocked']),reconciled:z.boolean(),sourceUrl:z.string().url().max(2000).optional(),timezone:z.string().max(80).optional(),sleepDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),sleepStart:z.string().datetime({offset:true}).optional(),sleepEnd:z.string().datetime({offset:true}).optional(),actualSleepMinutes:z.number().min(0).max(1440).optional(),detail:z.string().min(1).max(2000)}).strict().superRefine((x,c)=>{
 if(x.reconciled&&x.status!=='fresh')c.addIssue({code:'custom',message:'Only verified fresh sleep can be reconciled.'})
 const interval=!!(x.sleepStart&&x.sleepEnd&&Date.parse(x.sleepEnd)>Date.parse(x.sleepStart))
 const datedMetrics=!!(x.sleepDate&&x.sourceUrl&&new URL(x.sourceUrl).pathname.includes('/sleep/1d/'+x.sleepDate+'/')&&x.actualSleepMinutes!==undefined)
 if(x.status==='fresh'&&(!x.sourceUrl||new URL(x.sourceUrl).hostname!=='app.whoop.com'||!x.timezone||(!interval&&!datedMetrics)))c.addIssue({code:'custom',message:'Fresh sleep requires a WHOOP source, timezone, and either verified endpoints or a dated completed sleep record with actual sleep minutes.'})
 if(x.reconciled&&!interval)c.addIssue({code:'custom',message:'Calendar reconciliation requires verified sleep start and end; do not invent endpoints from heart-rate samples.'})
 if((x.sleepStart||x.sleepEnd)&&!interval)c.addIssue({code:'custom',message:'Supply both verified endpoints in chronological order, or omit both.'})
 if(x.status==='fresh'&&x.sleepDate){
  let today='';try{today=new Intl.DateTimeFormat('en-CA',{timeZone:x.timezone||'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}catch{}
  const age=Date.parse(today+'T00:00:00Z')-Date.parse(x.sleepDate+'T00:00:00Z')
  if(!Number.isFinite(age)||age<0||age>2*86400000||new Date(x.sleepDate+'T00:00:00Z').toISOString().slice(0,10)!==x.sleepDate)c.addIssue({code:'custom',message:'Fresh sleep date must be valid, recent, and not in the future in its displayed timezone.'})
 }
 if(x.status==='fresh'&&x.sleepEnd&&(Date.parse(x.sleepEnd)<Date.now()-48*3600000||Date.parse(x.sleepEnd)>Date.now()+300000))c.addIssue({code:'custom',message:'Fresh sleep must be recent and must not end in the future.'})
 if(x.actualSleepMinutes!==undefined&&x.sleepStart&&x.sleepEnd&&x.actualSleepMinutes>(Date.parse(x.sleepEnd)-Date.parse(x.sleepStart))/60000+1)c.addIssue({code:'custom',message:'Actual sleep cannot exceed its recorded interval.'})
 if(x.timezone)try{new Intl.DateTimeFormat('en',{timeZone:x.timezone})}catch{c.addIssue({code:'custom',message:'Use a valid timezone.'})}
})
export async function readWhoopReview(username:string,channel:'agent'|'chat'){
 const settings=storage(await db().from('planner_vm_settings').select('sources,schedule_enabled,subscription_schedule_enabled').eq('username',username).maybeSingle())
 const row=storage(await db().from('planner_whoop_reviews').select('*').eq('username',username).eq('channel',channel).maybeSingle())
 return {enabled:settings?.sources?.includes('whoop')===true,scheduled:channel==='agent'?settings?.schedule_enabled===true:settings?.subscription_schedule_enabled===true,channel,state:row||null,retryIntervalMinutes:60,execution:channel==='chat'?'foreground relay only':'existing scheduled Agent worker'}
}
export async function reportWhoopReview(username:string,input:unknown){
 const args=whoopReportSchema.parse(input),{state,enabled}=await readWhoopReview(username,args.channel)
 if(!enabled)throw new ApiError(409,'WHOOP is not enabled for this account.')
 if(!state||state.updated_at!==args.expectedUpdatedAt)throw new ApiError(409,'WHOOP follow-up changed. Read it before reporting.')
 const {channel,expectedUpdatedAt,...observation}=args,now=new Date(),nextAt=args.status==='fresh'&&args.reconciled?null:new Date(now.getTime()+3600000).toISOString()
 const row=storage(await db().from('planner_whoop_reviews').update({status:args.status,checked_at:now.toISOString(),next_at:nextAt,observation,updated_at:now.toISOString()}).eq('username',username).eq('channel',channel).eq('updated_at',expectedUpdatedAt).select('username').maybeSingle())
 if(!row)throw new ApiError(409,'WHOOP follow-up changed during reporting. Read current state.')
 return readWhoopReview(username,channel)
}
type Add=(name:string,description:string,schema:z.ZodRawShape,scope:string,readOnly:boolean,execute:(args:any)=>Promise<unknown>)=>void
export function registerWhoopReviewTools(add:Add,username:string){
 add('planner_whoop_review_read','Read saved WHOOP freshness and hourly retry state for the specified review channel. Does not itself read WHOOP. Only report verified observations from the authorized browser. Scheduled reviews arm retry state automatically.',{channel:channelSchema},'planner:read',true,({channel})=>readWhoopReview(username,channel))
 add('planner_whoop_review_report','Save verified WHOOP check results with the current updated_at. Pending/blocked or unreconciled fresh data retries after one hour. Only mark reconciled after publishing and reading back a coherent calendar revision. Does not fetch WHOOP or edit the calendar itself.',whoopReportSchema.shape,'planner:write',false,args=>reportWhoopReview(username,args))
}
