import {db,ApiError} from './cloud.js'
import {storage} from './mcp-auth.js'
import {googleCalendarSession,googleCalendarStatus} from './agent.js'
import {calendarRow} from './planner-workspace.js'
import {eventType} from '../src/lib/eventType.js'
import {fixedEventPayload,fixedFingerprint,fixedGoogleId} from './fixed-event-payload.js'

const base='https://www.googleapis.com/calendar/v3/calendars/primary/events'
export async function fixedSyncStatus(username:string){
 const [queue,accounts]=await Promise.all([db().from('planner_google_fixed_sync').select('requested_revision,completed_revision,error,synced_at').eq('username',username).maybeSingle(),googleCalendarStatus(username)])
 const selected=accounts.accounts.find(a=>a.id===accounts.activeAccountId),state=storage(queue)
 return {connected:Boolean(selected?.canEdit),identity:selected?.identity||null,accountId:selected?.id||null,pending:Boolean(state&&state.requested_revision>state.completed_revision),error:state?.error||(!selected?'Connect Google Calendar in Add sites.':!selected.canEdit?'Reconnect Google Calendar and approve event editing.':null),syncedAt:state?.synced_at||null}
}
export async function enqueueFixedSync(username:string){
 const row=await calendarRow(username)
 storage(await db().from('planner_google_fixed_sync').upsert({username,requested_revision:row.revision,completed_revision:-1,retry_at:new Date().toISOString(),error:null},{onConflict:'username'}))
}
export async function requestFixedSync(username:string){await enqueueFixedSync(username);return processFixedSync(username)}
export async function processFixedSync(onlyUsername?:string){
 const claimed=storage(await db().rpc('planner_claim_fixed_sync',{p_username:onlyUsername||null}))[0]
 if(!claimed)return {processed:0}
 const username=claimed.username,deadline=Date.now()+25000
 let processed=0
 try{
  const session=await googleCalendarSession(username,undefined,true),row=await calendarRow(username)
  const mappings=storage(await db().from('planner_google_fixed_events').select('*').eq('username',username).eq('account_id',session.accountId))
  const fixed=row.state.events.filter(e=>e.eventKind!=='folder'&&eventType(e,row.state.tags)==='fixed'),ids=new Set(fixed.map(e=>e.id))
  const headers={Authorization:'Bearer '+session.tokens.access_token,'Content-Type':'application/json'}
  const call=async(url:string,init:RequestInit={})=>{const response=await fetch(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});if(!response.ok&&![404,410].includes(response.status))throw new ApiError(response.status===401?401:502,'Google sync failed ('+response.status+'). '+(response.status===412?'The Google event changed; retry to reconcile.':'Reconnect the account if access expired.'));return response}
  const read=async(id:string):Promise<any>=>{const response=await call(base+'/'+encodeURIComponent(id));return response.ok?await response.json():null}
  const persist=async(localId:string,remoteId:string,managed:boolean,fingerprint:string)=>storage(await db().from('planner_google_fixed_events').upsert({username,account_id:session.accountId,local_id:localId,remote_id:remoteId,managed,fingerprint,updated_at:new Date().toISOString()},{onConflict:'username,account_id,local_id'}))
  const backup=async(id:string,before:any,after:any,kind:string)=>storage(await db().from('planner_calendar_history').insert({username,calendar_key:'google:'+session.accountId+':primary',event_id:id,title:after?.summary||before?.summary||'',kind,before,after}).select('id').single())
  let unfinished=false
  for(const event of fixed){
   const fingerprint=fixedFingerprint(event),mapping=mappings.find(m=>m.local_id===event.id)
   if(mapping?.fingerprint===fingerprint)continue
   if(processed>=12||Date.now()>deadline-3000){unfinished=true;break}
   const payload=fixedEventPayload(event),id=mapping?.remote_id||fixedGoogleId(username,event.id)
   let before=await read(id),managed=mapping?.managed??true
   if(!mapping&&!before){
    // Adopt an exact existing event instead of duplicating a Google appointment.
    const query=new URLSearchParams({singleEvents:event.recurrence.frequency==='none'?'true':'false',maxResults:'250',timeMin:event.start,timeMax:new Date(Date.parse(event.end)+60000).toISOString()})
    const candidates:any[]=[];let page:string|undefined
    do{if(page)query.set('pageToken',page);const response=await call(base+'?'+query);const data=await response.json() as any;candidates.push(...(data.items||[]));page=data.nextPageToken;if(Date.now()>deadline-3000)throw Error('Google reconciliation is still pending; it will retry.')}while(page)
    const same=(a:any,b:any)=>a?.date===b?.date&&(!a?.dateTime&&!b?.dateTime||Date.parse(a?.dateTime)===Date.parse(b?.dateTime))
    before=candidates.find(candidate=>candidate.status!=='cancelled'&&candidate.summary===payload.summary&&same(candidate.start,payload.start)&&same(candidate.end,payload.end)&&JSON.stringify(candidate.recurrence||[])===JSON.stringify(payload.recurrence))
    if(before){await persist(event.id,before.id,false,fingerprint);processed++;continue}
   }
   if(before?.status==='cancelled')throw Error('A linked Google event was cancelled. Review the fixed event before restoring it.')
   if(before&&managed&&before.extendedProperties?.private?.aipLocalId!==event.id)throw Error('Google event ownership could not be verified; no event was overwritten.')
   if(mapping&&!before){managed=true;/* Recreate under the stable app-owned ID, never another account's event ID. */}
   const remoteId=before?.id||fixedGoogleId(username,event.id)
   const body:Record<string,any>={...payload,...(!before?{id:remoteId,extendedProperties:{private:{aipLocalId:event.id}}}:{})}
   if(before?.recurringEventId){
    if(payload.recurrence.length)throw Error('This Google event is one occurrence of a series. Review series scope before turning it into a new recurring event.')
    delete body.recurrence // Google occurrence edits must preserve the parent series.
   }
   const audit=await backup(remoteId,before,body,'google-sync-pending')
   const response=await call(base+(before?'/'+encodeURIComponent(remoteId):'')+'?sendUpdates=none',{method:before?'PATCH':'POST',headers:before?{'If-Match':before.etag}:{},body:JSON.stringify(body)})
   if(!response.ok)throw Error('Google event is no longer available; sync will retry.')
   const after=await read(remoteId)
   if(!after)throw Error('Google write could not be verified; sync will reconcile by its stable ID.')
   storage(await db().from('planner_calendar_history').update({kind:'google-synced',after}).eq('username',username).eq('id',audit.id))
   await persist(event.id,remoteId,managed,fingerprint);processed++
  }
  for(const mapping of mappings.filter(m=>!ids.has(m.local_id))){
   if(processed>=12||Date.now()>deadline-3000){unfinished=true;break}
   // Never delete an original Google event adopted during deduplication.
   if(mapping.managed){const before=await read(mapping.remote_id);if(before&&before.status!=='cancelled'){
    if(before.extendedProperties?.private?.aipLocalId!==mapping.local_id)throw Error('Google mirror ownership changed; review it before removing.')
    const audit=await backup(mapping.remote_id,before,null,'google-sync-removal-pending')
    await call(base+'/'+encodeURIComponent(mapping.remote_id)+'?sendUpdates=none',{method:'DELETE',headers:{'If-Match':before.etag}})
    storage(await db().from('planner_calendar_history').update({kind:'google-sync-removed'}).eq('username',username).eq('id',audit.id))
   }}
   storage(await db().from('planner_google_fixed_events').delete().eq('username',username).eq('account_id',session.accountId).eq('local_id',mapping.local_id));processed++
  }
  storage(await db().from('planner_google_fixed_sync').update({...(unfinished?{}:{completed_revision:row.revision,synced_at:new Date().toISOString()}),lease_until:new Date(0).toISOString(),retry_at:new Date().toISOString(),error:null}).eq('username',username).eq('lease',claimed.lease))
  return {processed,pending:unfinished}
 }catch(error){
  const message=error instanceof Error?error.message:'Google sync failed. It will retry.'
  storage(await db().from('planner_google_fixed_sync').update({lease_until:new Date(0).toISOString(),retry_at:new Date(Date.now()+300000).toISOString(),error:message}).eq('username',username).eq('lease',claimed.lease))
  return {processed,pending:true,error:message}
 }
}
