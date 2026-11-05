import {useEffect} from 'react'
import {deviceCommandsRequest} from '../lib/api'
export function DeviceControlSync({username}:{username:string}){
 useEffect(()=>{
  if((window.plannerNativeChatGPTRelayVersion||0)<6)return
  let stopped=false,inFlight=false
  const poll=async()=>{if(stopped||inFlight||document.visibilityState==='hidden')return;inFlight=true
   try{const response=await deviceCommandsRequest<{command:null|{id:string;command:unknown;created_at:string}}>( {action:'claim'})
    const row=response.command;if(!row)return
    if(stopped)return // Claimed state remains uncertain; never reissue automatically.
    const {executeClientResults}=await import('../lib/clientControls')
    const results=await executeClientResults([{id:row.id,result:{structuredContent:{result:{requiresClient:true,clientAction:{version:1,command:row.command,issuedAt:row.created_at}}}}}],[{id:row.id,name:'planner_client_control'}],username,'device-queue',()=>!stopped)
    await deviceCommandsRequest({action:'finish',id:row.id,result:results[0]?.result,ok:results[0]?.result?.executed===true})
   }catch{/* Keep uncertain writes recorded. Agent must read the command before retrying. */}finally{inFlight=false}
  }
  void poll();const timer=setInterval(()=>void poll(),5000);window.addEventListener('focus',poll)
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',poll)}
 },[username])
 return null
}
