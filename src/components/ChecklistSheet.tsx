import {createContext,useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {PlannerDate} from '../lib/timezone'
import {CloseIcon,PlusIcon} from './Icons'
export const ChecklistSheetMetadata=createContext<((page:'todo'|'work',date:string)=>void)|null>(null)
export function ChecklistSheet({open,title,page,onPageChange,onClose,children}:{open:boolean;title:string;page:'todo'|'work';onPageChange:(page:'todo'|'work')=>void;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),changePage=useRef(onPageChange);changePage.current=onPageChange
 const [updated,setUpdated]=useState<Partial<Record<'todo'|'work',string>>>({})
 const reportDate=useCallback((page:'todo'|'work',date:string)=>setUpdated(current=>current[page]===date?current:{...current,[page]:date}),[])
 const [height,setHeight]=useState<number|null>(null),[viewport,setViewport]=useState(()=>window.innerHeight),[pulse,setPulse]=useState(false)
 const drag=useRef<{y:number;height:number}|null>(null),pulseTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const maxHeight=Math.max(200,viewport-64),minHeight=Math.min(280,maxHeight)
 const signal=useCallback(()=>{setPulse(true);if(pulseTimer.current)clearTimeout(pulseTimer.current);pulseTimer.current=setTimeout(()=>setPulse(false),900)},[])
 useEffect(()=>()=>{if(pulseTimer.current)clearTimeout(pulseTimer.current)},[])
 useEffect(()=>{const resize=()=>{setViewport(window.innerHeight);setHeight(value=>value===null?null:Math.min(value,Math.max(200,window.innerHeight-64)))};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
 const resizeTo=(value:number)=>setHeight(Math.max(minHeight,Math.min(maxHeight,value)))
 useEffect(()=>{if(!open)window.dispatchEvent(new CustomEvent('planner-client-settings',{detail:{open:false}}));if(open&&!ref.current?.open)ref.current?.showModal();else if(!open&&ref.current?.open)ref.current.close()},[open])
 useEffect(()=>{
  const node=ref.current;if(!open||!node)return
  let start:{x:number;y:number}|null=null,handled=false,signaled=false
  const begin=(event:TouchEvent)=>{handled=false;signaled=false;start=event.touches.length===1&&!(event.target as Element).closest('input,textarea,button,select')?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null}
  const move=(event:TouchEvent)=>{
   if(!start||event.touches.length!==1)return
   const dx=event.touches[0].clientX-start.x,dy=event.touches[0].clientY-start.y
   if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){start=null;return}
   if(Math.abs(dx)<16||Math.abs(dx)<=Math.abs(dy)*1.3)return
   if(event.cancelable)event.preventDefault();if(!signaled){signaled=true;signal()}
   if(!handled&&Math.abs(dx)>=50){handled=true;start=null;if(page==='todo'&&dx>0)changePage.current('work');else if(page==='work'&&dx<0)changePage.current('todo')}
  }
  const end=()=>{start=null}
  node.addEventListener('touchstart',begin,{capture:true,passive:true})
  node.addEventListener('touchmove',move,{capture:true,passive:false})
  node.addEventListener('touchend',end,true);node.addEventListener('touchcancel',end,true)
  return()=>{node.removeEventListener('touchstart',begin,true);node.removeEventListener('touchmove',move,true);node.removeEventListener('touchend',end,true);node.removeEventListener('touchcancel',end,true)}
 },[open,page,signal])
 return <dialog ref={ref} className="checklist-sheet" style={height===null?undefined:{height}} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}><header><button type="button" className="checklist-sheet-handle" role="slider" aria-label="Resize task sheet" aria-orientation="vertical" aria-valuemin={minHeight} aria-valuemax={maxHeight} aria-valuenow={Math.round(height??Math.min(viewport*.76,maxHeight))} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,height:ref.current!.getBoundingClientRect().height}}} onPointerMove={e=>{if(drag.current)resizeTo(drag.current.height+drag.current.y-e.clientY)}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();resizeTo(e.key==='Home'?minHeight:e.key==='End'?maxHeight:(height??ref.current!.getBoundingClientRect().height)+(e.key==='ArrowUp'?40:-40))}}}/><div><div className="checklist-sheet-title"><h2>{title}</h2>{updated[page]&&<time dateTime={updated[page]} aria-label="Last updated">Last updated {new PlannerDate(updated[page]!).toLocaleString(undefined,{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</time>}</div><div className="checklist-sheet-actions"><button type="button" className="checklist-add-item" onClick={()=>window.dispatchEvent(new Event('planner-add-checklist-item'))}><PlusIcon size={16}/>Add item</button><button type="button" className="icon-btn" aria-label={'Close '+title} onClick={onClose}><CloseIcon/></button></div></div></header><ChecklistSheetMetadata.Provider value={reportDate}>{children}</ChecklistSheetMetadata.Provider><nav className={"checklist-page-dots"+(pulse?" is-switching":"")} aria-label="Task lists">{(['todo','work'] as const).map(value=><button type="button" key={value} aria-label={value==='todo'?'Tasks':'Work'} aria-current={page===value?'page':undefined} onClick={()=>{signal();onPageChange(value)}}/>)}</nav></dialog>
}
