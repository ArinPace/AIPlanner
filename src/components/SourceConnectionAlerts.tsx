import {useEffect,useState} from 'react'
import {sourceStatusRequest} from '../lib/api'
import type {SourceAlert} from '../lib/sourceAlerts'
export function SourceConnectionAlerts({username,active,refreshKey,onManage}:{username:string;active:boolean;refreshKey:string;onManage:()=>void}){
 const storageKey='planner-dismissed-source-issues:'+username
 const [issues,setIssues]=useState<SourceAlert[]>([]),[unavailable,setUnavailable]=useState(false)
 const [dismissed,setDismissed]=useState<string[]>(()=>{try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(value)?value.filter((id:unknown)=>typeof id==='string').slice(-200):[]}catch{return []}})
 useEffect(()=>{
  if(!active)return
  let stopped=false,inFlight=false
  const read=async()=>{
   if(inFlight||document.visibilityState==='hidden')return
   inFlight=true
   try{const next=await sourceStatusRequest();if(stopped)return;setIssues(next.issues);setUnavailable(false);const ids=new Set(next.issues.map(issue=>issue.id));setDismissed(previous=>{const remaining=previous.filter(id=>ids.has(id));try{localStorage.setItem(storageKey,JSON.stringify(remaining))}catch{/* Keep dismissals for this session. */}return remaining})}
   catch{if(!stopped)setUnavailable(true)}finally{inFlight=false}
  }
  void read();const timer=setInterval(()=>void read(),10000);window.addEventListener('focus',read)
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',read)}
 },[active,refreshKey,storageKey])
 function dismiss(id:string){setDismissed(previous=>{const next=[...new Set([...previous,id])];try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{/* Keep dismissals for this session. */}return next})}
 const visible=issues.filter(issue=>!dismissed.includes(issue.id))
 const statusId='source-status-unavailable'
 if(!visible.length&&(!unavailable||dismissed.includes(statusId)))return null
 return <section className="source-connection-alerts" aria-label="Source connection issues">
 {visible.map(issue=><div role="alert" className="source-connection-alert" key={issue.id}><div><strong>{issue.title}</strong><span>{issue.message}</span><button type="button" onClick={onManage}>Manage connections</button></div><button type="button" className="icon-btn" aria-label={'Dismiss '+issue.title+' warning'} onClick={()=>dismiss(issue.id)}>×</button></div>)}
 {unavailable&&!dismissed.includes(statusId)&&<div role="alert" className="source-connection-alert"><span>Source connection status is unavailable. Retrying automatically.</span><button type="button" className="icon-btn" aria-label="Dismiss source status warning" onClick={()=>dismiss(statusId)}>×</button></div>}
 </section>
}
