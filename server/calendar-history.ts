import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {calendarRow} from './planner-workspace.js'
import {normalizeEventFolders} from '../src/lib/eventFolders.js'
export async function calendarHistory(username:string,args:{before?:number;versionId?:number;eventId?:string;calendarKey?:string}){
 if(args.versionId){const row=storage(await db().from('planner_calendar_history').select('*').eq('username',username).eq('id',args.versionId).maybeSingle());if(!row)throw new ApiError(404,'Calendar version not found.');return {version:row}}
 let query=db().from('planner_calendar_history').select('id,calendar_key,event_id,title,kind,calendar_revision,created_at').eq('username',username)
 if(args.eventId)query=query.eq('event_id',args.eventId)
 if(args.calendarKey)query=query.eq('calendar_key',args.calendarKey)
 if(args.before)query=query.lt('id',args.before)
 const rows=storage(await query.order('id',{ascending:false}).limit(51))
 return {versions:rows.slice(0,50),hasMore:rows.length>50,nextBefore:rows.length>50?rows[49].id:null}
}
export async function restoreCalendarEvent(username:string,args:{versionId:number;revision:number;side:'before'|'after';overwrite?:boolean}){
 const saved=storage(await db().from('planner_calendar_history').select('*').eq('username',username).eq('id',args.versionId).maybeSingle())
 if(!saved||saved.calendar_key!=='internal'||!saved.event_id)throw new ApiError(404,'Internal calendar event version not found.')
 const event=saved[args.side]
 if(!event||event.id!==saved.event_id)throw new ApiError(400,'That version side has no event to restore.')
 const row=await calendarRow(username)
 if(row.revision!==args.revision)throw new ApiError(409,'Read the latest calendar revision before restoring.')
 const exists=row.state.events.some(e=>e.id===event.id)
 if(exists&&!args.overwrite)throw new ApiError(409,'This event still exists. Review it and explicitly choose overwrite to restore an older version.')
 // Recover missing tag definitions from the latest historical tag snapshot.
 for(const id of event.tagIds||[]){if(row.state.tags.some(t=>t.id===id))continue
  const history=storage(await db().from('planner_calendar_history').select('before,after').eq('username',username).eq('calendar_key','internal').eq('kind','tags').order('id',{ascending:false}).limit(100))
  const tag=history.flatMap(h=>[...(h.after||[]),...(h.before||[])]).find(t=>t.id===id)
  row.state.tags.push(tag||{id,name:'Restored tag',color:'#5f6368'})
 }
 row.state.events=normalizeEventFolders([...row.state.events.filter(e=>e.id!==event.id),event])
 const rows=storage(await db().from('planner_calendars').update({state:row.state,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',row.revision).select('revision'))
 if(!rows.length)throw new ApiError(409,'Calendar changed. Read it again before restoring.')
 return {saved:true,event,revision:rows[0].revision}
}
