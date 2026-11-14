import {createContext,useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {PlusIcon} from './Icons'
export const ChecklistSheetToolbar=createContext<HTMLElement|null>(null)
export function ChecklistSheet({open,title,page,onPageChange,onClose,children}:{open:boolean;title:string;page:'todo'|'work';onPageChange:(page:'todo'|'work')=>void;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),changePage=useRef(onPageChange);changePage.current=onPageChange
 const [toolbarTarget,setToolbarTarget]=useState<HTMLDivElement|null>(null),[offset,setOffset]=useState(0),[slide,setSlide]=useState(0),[paging,setPaging]=useState(false),[closing,setClosing]=useState(false)
 const closeRef=useRef(onClose);closeRef.current=onClose
 const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),closingRef=useRef(false)
 const dismiss=useCallback(()=>{const node=ref.current;if(!node||closingRef.current)return;closingRef.current=true;setClosing(true);setOffset(window.innerHeight-node.getBoundingClientRect().top+32);closeTimer.current=setTimeout(()=>closeRef.current(),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:240)},[])
 useEffect(()=>()=>{if(closeTimer.current)clearTimeout(closeTimer.current)},[])
 const [height,setHeight]=useState<number|null>(null),[viewport,setViewport]=useState(()=>window.innerHeight),[pulse,setPulse]=useState(false)
 const drag=useRef<{y:number;height:number}|null>(null),pulseTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const maxHeight=Math.max(200,viewport-64),minHeight=Math.min(280,maxHeight)
 const signal=useCallback(()=>{setPulse(true);if(pulseTimer.current)clearTimeout(pulseTimer.current);pulseTimer.current=setTimeout(()=>setPulse(false),900)},[])
 useEffect(()=>()=>{if(pulseTimer.current)clearTimeout(pulseTimer.current)},[])
 useEffect(()=>{const resize=()=>{setViewport(window.innerHeight);setHeight(value=>value===null?null:Math.min(value,Math.max(200,window.innerHeight-64)))};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
 const resizeTo=(value:number)=>setHeight(Math.max(minHeight,Math.min(maxHeight,value)))
 useEffect(()=>{if(!open){if(closeTimer.current)clearTimeout(closeTimer.current);closingRef.current=false;setClosing(false);setOffset(0)};if(!open)window.dispatchEvent(new CustomEvent('planner-client-settings',{detail:{open:false}}));if(open&&!ref.current?.open)ref.current?.showModal();else if(!open&&ref.current?.open)ref.current.close()},[open])
 useEffect(()=>{
  const node=ref.current;if(!open||!node)return
  let start:{x:number;y:number;dismiss:boolean}|null=null,signaled=false,down=0,horizontal=0
  const begin=(target:EventTarget|null,x:number,y:number)=>{
   signaled=false;down=0;horizontal=0
   start=target instanceof Element&&!target.closest('input,textarea,button,select')?{x,y,dismiss:Boolean(target.closest('header'))||(node.querySelector('[data-checklist-active="true"] .apple-note-scroll')?.scrollTop||0)<=0}:null
  }
  const move=(x:number,y:number,event:Event)=>{
   if(!start)return
   const dx=x-start.x,dy=y-start.y
   if(!horizontal&&dy>4&&dy>Math.abs(dx)*1.3&&start.dismiss){if(event.cancelable)event.preventDefault();down=dy;setOffset(dy);return}
   if(!horizontal&&Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){start=null;return}
   if(Math.abs(dx)<4||(!horizontal&&Math.abs(dx)<=Math.abs(dy)*1.3))return
   if(event.cancelable)event.preventDefault()
   if(!signaled){signaled=true;signal()}
   horizontal=dx
   const allowed=page==='todo'?Math.min(0,dx):Math.max(0,dx)
   setPaging(true);setSlide(Math.max(-node.clientWidth,Math.min(node.clientWidth,allowed)))
  }
  const finish=(cancel=false)=>{
   const shouldDismiss=!cancel&&down>=42
   if(shouldDismiss)dismiss()
   if(!cancel&&Math.abs(horizontal)>node.clientWidth*.23){if(page==='todo'&&horizontal<0)changePage.current('work');else if(page==='work'&&horizontal>0)changePage.current('todo')}
   start=null;down=0;horizontal=0;if(!shouldDismiss)setOffset(0);setPaging(false);setSlide(0)
  }
  const touchStart=(event:TouchEvent)=>{if(event.touches.length===1)begin(event.target,event.touches[0].clientX,event.touches[0].clientY);else start=null}
  const touchMove=(event:TouchEvent)=>{if(event.touches.length===1)move(event.touches[0].clientX,event.touches[0].clientY,event)}
  const end=()=>finish(),cancel=()=>finish(true)
  const mouseStart=(event:PointerEvent)=>{if(event.pointerType==='mouse'&&event.button===0)begin(event.target,event.clientX,event.clientY)}
  const mouseMove=(event:PointerEvent)=>{if(event.pointerType==='mouse'&&event.buttons===1)move(event.clientX,event.clientY,event)}
  const mouseEnd=(event:PointerEvent)=>{if(event.pointerType==='mouse')finish()}
  node.addEventListener('touchstart',touchStart,{capture:true,passive:true});node.addEventListener('touchmove',touchMove,{capture:true,passive:false})
  node.addEventListener('touchend',end,true);node.addEventListener('touchcancel',cancel,true)
  node.addEventListener('pointerdown',mouseStart,true);window.addEventListener('pointermove',mouseMove,true);window.addEventListener('pointerup',mouseEnd,true)
  return()=>{node.removeEventListener('touchstart',touchStart,true);node.removeEventListener('touchmove',touchMove,true);node.removeEventListener('touchend',end,true);node.removeEventListener('touchcancel',cancel,true);node.removeEventListener('pointerdown',mouseStart,true);window.removeEventListener('pointermove',mouseMove,true);window.removeEventListener('pointerup',mouseEnd,true)}
 },[open,page,signal,dismiss])

 return <dialog ref={ref} className={"checklist-sheet"+(paging?" is-paging":"")+(closing?" is-closing":"")} style={{...(height===null?{}:{height}),...(offset?{transform:`translateY(${offset}px)`}:{})}} aria-label={title} onCancel={e=>{e.preventDefault();dismiss()}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss()}}}><header><button type="button" className="checklist-sheet-handle" role="slider" aria-label="Resize task sheet" aria-orientation="vertical" aria-valuemin={minHeight} aria-valuemax={maxHeight} aria-valuenow={Math.round(height??Math.min(viewport*.76,maxHeight))} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,height:ref.current!.getBoundingClientRect().height}}} onPointerMove={e=>{if(drag.current)resizeTo(drag.current.height+drag.current.y-e.clientY)}} onPointerUp={e=>{if(drag.current&&e.clientY-drag.current.y>=42)dismiss();drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();resizeTo(e.key==='Home'?minHeight:e.key==='End'?maxHeight:(height??ref.current!.getBoundingClientRect().height)+(e.key==='ArrowUp'?40:-40))}}}/><div><div className="checklist-sheet-title"><h2>{title}</h2></div><div className="checklist-sheet-actions"><button type="button" className="checklist-add-item" aria-label="Add item" title="Add item" onClick={()=>window.dispatchEvent(new Event('planner-add-checklist-item'))}><PlusIcon size={20}/></button><div ref={setToolbarTarget} className="checklist-toolbar-slot"/></div></div></header><ChecklistSheetToolbar.Provider value={toolbarTarget}><div className="checklist-pages-viewport"><div className="checklist-pages-track" style={{transform:`translate3d(calc(${page==='work'?-100:0}% + ${slide}px),0,0)`,transition:paging?'none':undefined}}>{children}</div></div></ChecklistSheetToolbar.Provider><nav className={"checklist-page-dots"+(pulse?" is-switching":"")} aria-label="Task lists">{(['todo','work'] as const).map(value=><button type="button" key={value} aria-label={value==='todo'?'Tasks':'Work'} aria-current={page===value?'page':undefined} onClick={()=>{signal();onPageChange(value)}}/>)}</nav></dialog>
}
