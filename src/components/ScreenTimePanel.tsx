import {useEffect, useState} from 'react'
import {nativeRequest, supportsScreenTime} from '../lib/platform'
type SetupStatus={completed:boolean;authorized:boolean;groups:{id:string;name:string}[];location:string|null}
export function ScreenTimePanel(){
 const [opening,setOpening]=useState(false)
 const [error,setError]=useState('')
 const [status,setStatus]=useState<SetupStatus|null>(null)
 const native=supportsScreenTime()
 useEffect(()=>{
  if(!native)return
  let active=true,version=0
  const refresh=()=>{const request=++version;void nativeRequest<SetupStatus>({action:'screenTimeStatus'}).then(value=>{if(active&&request===version)setStatus(value)}).catch(()=>{})}
  refresh()
  window.addEventListener('plannerScreenTimeChanged',refresh)
  window.addEventListener('focus',refresh)
  return ()=>{active=false;window.removeEventListener('plannerScreenTimeChanged',refresh);window.removeEventListener('focus',refresh);void nativeRequest({action:'screenTimePanel',visible:false}).catch(()=>{})}
 },[native])
 async function setup(){
  setOpening(true);setError('')
  try{await nativeRequest({action:'screenTimeSetup'})}
  catch(e){setError(e instanceof Error?e.message:'Could not open Screen Time setup.')}
  finally{setOpening(false)}
 }
 const ready=Boolean(status&&(status.completed||status.groups.length>0||status.location))
 return <section aria-label="Screen Time" style={{flex:1,minHeight:0,overflow:'auto',padding:'48px 24px'}}>
  <div style={{maxWidth:420,margin:'0 auto',textAlign:'center'}}>
   <div style={{width:64,height:64,borderRadius:20,background:'#eaf2ff',color:'#1671ed',display:'grid',placeItems:'center',margin:'0 auto 24px'}} aria-hidden="true">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>
   </div>
   <h2 style={{margin:'0 0 12px'}}>{ready?'Your Screen Time setup':'Make room for focus'}</h2>
   <p style={{color:'var(--text-secondary, #68717d)',lineHeight:1.6,margin:'0 0 28px'}}>{ready?'Your planner can use these groups and location preferences when scheduling blocking.':'Choose app groups and optional locations. Your planner can handle when to block them.'}</p>
   {ready&&<div style={{textAlign:'left',border:'1px solid #dce3ec',borderRadius:18,padding:20,marginBottom:24}}>
    <p style={{margin:'0 0 12px',fontWeight:600}}>App groups</p>
    {status.groups.length?<ul style={{paddingLeft:20,margin:'0 0 20px'}}>{status.groups.map(group=><li key={group.id} style={{marginBottom:8}}>{group.name}</li>)}</ul>:<p>No groups yet. You can add them in Edit setup.</p>}
    <p style={{margin:'0 0 6px',fontWeight:600}}>Location</p><p style={{margin:0}}>{status.location??'No location restriction'}</p>
    {!status.authorized&&<p role="alert" style={{color:'#b45309'}}>Screen Time permission needs to be renewed. Open Edit setup to allow access.</p>}
   </div>}
   <button type="button" onClick={()=>void setup()} disabled={opening||!native} style={{padding:'14px 24px',border:0,borderRadius:14,background:'#1671ed',color:'#fff',fontSize:16,fontWeight:600,width:'100%',minHeight:50,cursor:'pointer',opacity:native?1:0.55}}>{opening?'Opening…':ready?'Edit setup':'Set up Screen Time'}</button>
   {!native&&<p style={{fontSize:14,color:'var(--text-secondary, #68717d)'}}>Open Planner on your iPhone to set up app blocking.</p>}
   {error&&<p role="alert" className="form-error">{error}</p>}
  </div>
 </section>
}
