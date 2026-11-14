import {createContext,useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {PlusIcon} from './Icons'
export const ChecklistSheetToolbar=createContext<HTMLElement|null>(null)
export function ChecklistSheet({open,title,page,onPageChange,onClose,children}:{open:boolean;title:string;page:'todo'|'work';onPageChange:(page:'todo'|'work')=>void;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),changePage=useRef(onPageChange);changePage.current=onPageChange
 const [toolbarTarget,setToolbarTarget]=useState<HTMLDivElement|null>(null),[offset,setOffset]=useState(0)
 const closeRef=useRef(onClose);closeRef.current=onClose
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
  let start:{x:number;y:number;dismiss:boolean}|null=null,handled=false,signaled=false,down=0
  const begin=(event:TouchEvent)=>{handled=false;signaled=false;down=0;start=event.touches.length===1&&!(event.target as Element).closest('input,textarea,button,select')?{x:event.touches[0].clientX,y:event.touches[0].clientY,dismiss:Boolean((event.target as Element).closest('header'))||(node.querySelector('.files-tab-panel:not([hidden]) .apple-note-scroll')?.scrollTop||0)<=0}:null}
  const move=(event:TouchEvent)=>{
   if(!start||event.touches.length!==1)return
   const dx=event.touches[0].clientX-start.x,dy=event.touches[0].clientY-start.y
   if(dy>4&&dy>Math.abs(dx)*1.3&&start.dismiss){if(event.cancelable)event.preventDefault();down=dy;setOffset(dy);return}
   if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){start=null;return}
   if(Math.abs(dx)<16||Math.abs(dx)<=Math.abs(dy)*1.3)return
   if(event.cancelable)event.preventDefault();if(!signaled){signaled=true;signal()}
   if(!handled&&Math.abs(dx)>=50){handled=true;start=null;if(page==='todo'&&dx>0)changePage.current('work');else if(page==='work'&&dx<0)changePage.current('todo')}
  }
  const end=()=>{start=null;if(down>=80)closeRef.current();down=0;setOffset(0)}
  node.addEventListener('touchstart',begin,{capture:true,passive:true})
  node.addEventListener('touchmove',move,{capture:true,passive:false})
  const cancel=()=>{start=null;down=0;setOffset(0)}
  node.addEventListener('touchend',end,true);node.addEventListener('touchcancel',cancel,true)
  return()=>{node.removeEventListener('touchstart',begin,true);node.removeEventListener('touchmove',move,true);node.removeEventListener('touchend',end,true);node.removeEventListener('touchcancel',cancel,true)}
 },[open,page,signal])
 return <dialog ref={ref} className="checklist-sheet" style={{...(height===null?{}:{height}),...(offset?{transform:`translateY(${offset}px)`}:{})}} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}><header><button type="button" className="checklist-sheet-handle" role="slider" aria-label="Resize task sheet" aria-orientation="vertical" aria-valuemin={minHeight} aria-valuemax={maxHeight} aria-valuenow={Math.round(height??Math.min(viewport*.76,maxHeight))} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,height:ref.current!.getBoundingClientRect().height}}} onPointerMove={e=>{if(drag.current)resizeTo(drag.current.height+drag.current.y-e.clientY)}} onPointerUp={e=>{if(drag.current&&e.clientY-drag.current.y>=100)onClose();drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();resizeTo(e.key==='Home'?minHeight:e.key==='End'?maxHeight:(height??ref.current!.getBoundingClientRect().height)+(e.key==='ArrowUp'?40:-40))}}}/><div><div className="checklist-sheet-title"><h2>{title}</h2></div><div className="checklist-sheet-actions"><button type="button" className="checklist-add-item" aria-label="Add item" title="Add item" onClick={()=>window.dispatchEvent(new Event('planner-add-checklist-item'))}><PlusIcon size={20}/></button><div ref={setToolbarTarget} className="checklist-toolbar-slot"/></div></div></header><ChecklistSheetToolbar.Provider value={toolbarTarget}>{children}</ChecklistSheetToolbar.Provider><nav className={"checklist-page-dots"+(pulse?" is-switching":"")} aria-label="Task lists">{(['todo','work'] as const).map(value=><button type="button" key={value} aria-label={value==='todo'?'Tasks':'Work'} aria-current={page===value?'page':undefined} onClick={()=>{signal();onPageChange(value)}}/>)}</nav></dialog>
}
