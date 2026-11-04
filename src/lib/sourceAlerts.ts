import {VM_SOURCES,type VmSource,type VmState} from './vm.js'
export type SourceAlert={id:string;source:VmSource;title:string;message:string}
type Health={source:VmSource;connection_key:string;incident_id:string;error:string;first_detected_at:string}
export function sourceAlerts(settings:VmState['settings'],google:VmState['google'],sync:{error?:string|null;reviewRequired?:boolean;accountId?:string|null;syncedAt?:string|null},health:Health[]):SourceAlert[]{
 const enabled=new Set(settings.sources),issues:SourceAlert[]=[]
 for(const item of health){
  if(!enabled.has(item.source)||!item.error)continue
  const account=google?.accounts.find(a=>a.id===item.connection_key)
  if(/^[a-f0-9-]{36}$/i.test(item.connection_key)&&!account)continue
  if(account?.readEnabled===false&&account.id!==google?.activeAccountId)continue
  issues.push({id:'health:'+item.incident_id,source:item.source,title:VM_SOURCES[item.source].name+(account?' · '+account.identity:''),message:item.error})
 }
 for(const source of settings.sources){
  if(!(source in VM_SOURCES)||settings.sites[source]?.ready===true)continue
  if(source==='calendar'&&google?.connected)continue
  if(source==='gmail'&&google?.accounts.some(a=>a.canReadMail&&a.connected&&a.readEnabled!==false))continue
  if(issues.some(issue=>issue.source===source))continue
  issues.push({id:'connection:'+source+':'+(settings.sites[source]?.verifiedAt||'unverified'),source,title:VM_SOURCES[source].name,message:settings.sites[source]?.ready===false?'Connection check failed. Reconnect or verify this source.':'Access has not been verified. Connect or verify this source.'})
 }
 if(enabled.has('calendar')){
  if(sync.error)issues.push({id:'calendar-sync:'+String(sync.accountId)+':'+(sync.syncedAt||'never')+':'+sync.error,source:'calendar',title:'Google Calendar sync',message:sync.error})
  else if(sync.reviewRequired)issues.push({id:'calendar-review:'+String(sync.accountId)+':'+(sync.syncedAt||'never'),source:'calendar',title:'Google Calendar is not up to date',message:'Calendar changes are waiting for agent review before they can sync.'})
 }
 return issues
}
