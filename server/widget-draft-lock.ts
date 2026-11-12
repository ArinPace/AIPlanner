import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
export async function hasWidgetDraft(username:string){
 const row=storage(await db().from('planner_calendar_staging').select('status,feedback:payload->widgetFeedback').eq('username',username).in('status',['draft','stale']).order('created_at',{ascending:false}).limit(1).maybeSingle())
 return Boolean(row&&['draft','stale'].includes(row.status)&&Array.isArray(row.feedback)&&row.feedback.length)
}
export async function requireNoWidgetDraft(username:string){
 if(await hasWidgetDraft(username))throw new ApiError(409,'A widget schedule revision is being prepared. Keep live calendars unchanged: use planner_calendar_stage_read/edit and publish the completed draft once. Refresh/review a stale draft instead of bypassing it.')
}
