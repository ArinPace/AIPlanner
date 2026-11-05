import {useEffect, useState} from 'react'
import {nativeRequest, supportsScreenTime} from '../lib/platform'

export function ScreenTimePanel(){
 const [opening,setOpening]=useState(false)
 const [error,setError]=useState('')
 const native=supportsScreenTime()
 useEffect(()=>()=>{if(native)void nativeRequest({action:'screenTimePanel',visible:false}).catch(()=>{})},[native])
 async function setup(){
  setOpening(true);setError('')
  try{await nativeRequest({action:'screenTimeSetup'})}
  catch(e){setError(e instanceof Error?e.message:'Could not open Screen Time setup.')}
  finally{setOpening(false)}
 }
 return <section aria-label="Screen Time" style={{flex:1,minHeight:0,overflow:'auto',padding:'48px 24px'}}>
  <div style={{maxWidth:420,margin:'0 auto',textAlign:'center'}}>
   <div style={{width:64,height:64,borderRadius:20,background:'#eaf2ff',color:'#1671ed',display:'grid',placeItems:'center',margin:'0 auto 24px'}} aria-hidden="true">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>
   </div>
   <h2 style={{margin:'0 0 12px'}}>Make room for focus</h2>
   <p style={{color:'var(--text-secondary, #68717d)',lineHeight:1.6,margin:'0 0 28px'}}>Choose app groups and optional locations. Your planner can handle when to block them.</p>
   <button type="button" onClick={()=>void setup()} disabled={opening||!native} style={{padding:'14px 24px',border:0,borderRadius:14,background:'#1671ed',color:'#fff',fontSize:16,fontWeight:600,width:'100%',minHeight:50,cursor:'pointer',opacity:native?1:0.55}}>{opening?'Opening…':'Set up Screen Time'}</button>
   {!native&&<p style={{fontSize:14,color:'var(--text-secondary, #68717d)'}}>Open Planner on your iPhone to set up app blocking.</p>}
   {error&&<p role="alert" className="form-error">{error}</p>}
  </div>
 </section>
}
