import {clientControlSchema,type ClientControl} from './clientControlSchema'
import {nativeRequest} from './platform'
export function requestClientUI(command:ClientControl,account:string):Promise<unknown>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Planner UI did not acknowledge this action. Read UI state before retrying.')),8000)
 window.dispatchEvent(new CustomEvent('planner-client-ui',{detail:{account,command,resolve:(value:unknown)=>{clearTimeout(timer);resolve(value)},reject:(error:unknown)=>{clearTimeout(timer);reject(error)}}}))})
}
export async function executeClientResults(results:any[],calls:{id:string;name:string}[],account:string,turnId:string){
 const output=[]
 for(const entry of results){
  const call=calls.find(c=>c.id===entry.id),payload=entry.result?.structuredContent?.result
  if(call?.name!=='planner_client_control'||!payload?.requiresClient||!payload?.clientAction){output.push(entry);continue}
  try{
   const command=clientControlSchema.parse(payload.clientAction.command)
   if(payload.clientAction.version!==1||!Number.isFinite(Date.parse(payload.clientAction.issuedAt))||Date.now()-Date.parse(payload.clientAction.issuedAt)>7200000)throw Error('This client command expired. Read current state before continuing.')
   let result:unknown
   if(command.action.startsWith('ui_'))result=await requestClientUI(command,account)
   else{
    if((window.plannerNativeChatGPTRelayVersion||0)<6)throw Error('Update the iPhone app to use native Screen Time tools. No native change was made.')
    if(command.action==='screen_time_pick_apps')await requestClientUI({action:'ui_navigate',tab:'screentime'},account)
    result=await nativeRequest({action:'plannerClientScreenTime',account,command,issuedAt:payload.clientAction.issuedAt,receiptKey:turnId+':'+entry.id})
   }
   output.push({id:entry.id,result:{executed:true,clientResult:result}})
  }catch(error){output.push({id:entry.id,result:{isError:true,error:error instanceof Error?error.message:'Client control failed. No success is confirmed; read current state.'}})}
 }
 return output
}
