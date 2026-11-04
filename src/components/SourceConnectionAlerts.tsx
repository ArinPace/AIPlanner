import {createPortal} from 'react-dom'
import {useEffect,useState} from 'react'
import {notificationInboxRequest} from '../lib/api'
type Notice={id:string;title:string;message:string;kind:string;checked:boolean;created_at:string;active:boolean}
export function SourceConnectionAlerts({username,active,refreshKey,onManage}:{username:string;active:boolean;refreshKey:string;onManage:()=>void}){
 const [items,setItems]=useState<Notice[]>([]),[error,setError]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState<string|null>(null)
 useEffect(()=>{
  if(!active)return
  let stopped=false,inFlight=false
  const read=async()=>{if(inFlight||document.visibilityState==='hidden')return;inFlight=true;try{const next=await notificationInboxRequest<{items:Notice[]}>();if(!stopped){setItems(next.items);setError('')}}catch(e){if(!stopped)setError(e instanceof Error?e.message:'Notifications unavailable.')}finally{inFlight=false}}
  void read();const timer=setInterval(()=>void read(),10000);window.addEventListener('focus',read)
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',read)}
 },[username,active,refreshKey])
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[open])
 async function check(item:Notice){setBusy(item.id);try{await notificationInboxRequest({id:item.id,checked:!item.checked});setItems(previous=>previous.map(value=>value.id===item.id?{...value,checked:!item.checked}:value));setError('')}catch(e){setError(e instanceof Error?e.message:'Could not save notification.')}finally{setBusy(null)}}
 const unread=items.filter(item=>!item.checked).length
 return <><button type="button" className="assistant-new-chat assistant-sidebar-notifications" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>Notifications{unread?' ('+unread+')':''}</button>
 {open&&createPortal(<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><section role="dialog" aria-modal="true" aria-label="Notifications" className="event-modal notification-inbox" onMouseDown={e=>e.stopPropagation()}><div className="files-dialog-head"><h2>Notifications</h2><button type="button" autoFocus aria-label="Close notifications" onClick={()=>setOpen(false)}>×</button></div><p>Check an item when you’ve handled it. Records stay saved; checking a connection issue does not repair it.</p>{error&&<p role="alert">{error}</p>}{!items.length&&!error&&<p>No notifications yet.</p>}<ul>{[...items].sort((a,b)=>Number(a.checked)-Number(b.checked)).map(item=><li key={item.id}><label><input type="checkbox" checked={item.checked} disabled={busy!==null} onChange={()=>void check(item)}/><span><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.created_at).toLocaleString()}{item.kind==='source'?(item.active?' · Still needs attention':' · No longer reported'):''}</small></span></label>{item.kind==='source'&&item.active&&<button type="button" onClick={()=>{setOpen(false);onManage()}}>Manage connections</button>}</li>)}</ul></section></div>,document.body)}</>
}
