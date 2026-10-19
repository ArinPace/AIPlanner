import {z} from 'zod'
import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {googleCalendarSession} from './agent.js'
import {datetime} from './planner-workspace.js'
export const googleEventPatch={accountId:z.string().uuid().optional(),eventId:z.string().min(1).max(1024).optional(),etag:z.string().max(300).optional(),requestId:z.string().uuid().optional(),scope:z.enum(['event','series']).optional(),title:z.string().trim().min(1).max(300).optional(),description:z.string().max(20000).optional(),location:z.string().max(2000).optional(),start:datetime.optional(),end:datetime.optional(),allDay:z.boolean().optional()}
type Patch=z.infer<z.ZodObject<typeof googleEventPatch>>
export async function readGoogleEvent(username:string,args:{eventId:string;accountId?:string}){
 const settings=storage(await db().from('planner_vm_settings').select('sources').eq('username',username).maybeSingle())
 if(!settings?.sources?.includes('calendar'))throw new ApiError(403,'Enable Google Calendar in Add sites before reading it.')
 const session=await googleCalendarSession(username,args.accountId)
 const response=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+encodeURIComponent(args.eventId),{headers:{Authorization:'Bearer '+session.tokens.access_token},signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw new ApiError(response.status===404?404:502,'Could not read this Google event.')
 return {accountId:session.accountId,calendarId:'primary',event:await response.json() as Record<string,any>}
}
export async function saveGoogleEvent(username:string,args:Patch){
 const settings=storage(await db().from('planner_vm_settings').select('sources').eq('username',username).maybeSingle())
 if(!settings?.sources?.includes('calendar'))throw new ApiError(403,'Enable Google Calendar in Add sites before editing it.')
 const session=await googleCalendarSession(username,args.accountId,true)
 const base='https://www.googleapis.com/calendar/v3/calendars/primary/events',headers={Authorization:'Bearer '+session.tokens.access_token}
 async function read(id:string){const response=await fetch(base+'/'+encodeURIComponent(id),{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new ApiError(response.status===404?404:502,'Could not read this Google event. Check the account and event ID.');return response.json() as Promise<Record<string,any>>}
 const before=args.eventId?await read(args.eventId):null
 if(before&&(!args.etag||args.etag!==before.etag))throw new ApiError(409,'Google event changed or etag is missing. Read it again before editing.')
 if(before?.recurrence&&args.scope!=='series')throw new ApiError(400,'This is a recurring Google series. Confirm scope series, or select an individual occurrence ID.')
 if(!before&&!args.requestId)throw new ApiError(400,'New Google events require a stable UUID requestId. Reuse it on retries to prevent duplicates.')
 const allDay=args.allDay??Boolean(before?.start?.date)
 if(args.allDay!==undefined&&Boolean(before?.start?.date)!==args.allDay&&before&&(!args.start||!args.end))throw new ApiError(400,'Changing all-day status requires both start and end.')
 const time=(value:string)=>allDay?{date:value.slice(0,10)}:{dateTime:value,timeZone:'America/New_York'}
 const patch:Record<string,any>={}
 for(const [input,output] of [['title','summary'],['description','description'],['location','location']] as const)if(args[input]!==undefined)patch[output]=args[input]
 if(args.start)patch.start=time(args.start)
 if(args.end)patch.end=time(args.end)
 const merged={...before,...patch}
 const start=merged.start?.dateTime||merged.start?.date,end=merged.end?.dateTime||merged.end?.date
 if(!merged.summary||!start||!end||Date.parse(end)<=Date.parse(start))throw new ApiError(400,'Supply a title and valid start/end. All-day end dates are exclusive; use explicit offsets for timed events.')
 if(before&&Object.keys(patch).length===0)throw new ApiError(400,'Choose fields to edit.')
 const id=args.eventId||args.requestId!.toLowerCase().replaceAll('-','')
 if(!before)patch.id=id
 const calendarKey='google:'+session.accountId+':primary'
 // Save the pre-edit state before touching Google. If the write times out,
 // this durable record still allows reconciliation by the exact event ID.
 const audit=storage(await db().from('planner_calendar_history').insert({username,calendar_key:calendarKey,event_id:id,title:merged.summary,kind:'google-pending',before,after:null}).select('id').single())
 let response:Response
 try{response=await fetch(base+(before?'/'+encodeURIComponent(id):'')+'?sendUpdates=none',{method:before?'PATCH':'POST',headers:{...headers,'Content-Type':'application/json',...(before?{'If-Match':args.etag!}:{})},body:JSON.stringify(patch),signal:AbortSignal.timeout(20000)})}catch{throw new ApiError(503,'Google write outcome is uncertain. Read the exact event ID '+id+' before retrying; its pre-edit history was saved.')}
 if(!response.ok){
  storage(await db().from('planner_calendar_history').update({kind:'google-failed'}).eq('username',username).eq('id',audit.id))
  throw new ApiError(response.status===412||response.status===409?409:response.status===403?403:502,response.status===412?'Google event changed; read it again before editing.':response.status===409?'An event with this requestId already exists. Read its exact ID before retrying.':'Google refused the event edit ('+response.status+'). Check the account permission and event state.')
 }
 const after=await read(id)
 storage(await db().from('planner_calendar_history').update({kind:before?'google-updated':'google-created',after}).eq('username',username).eq('id',audit.id))
 return {saved:true,accountId:session.accountId,identity:session.identity,calendarId:'primary',event:after,historyId:audit.id}
}
