import {useEffect,useRef,type ReactNode} from 'react'
import {CloseIcon,PlusIcon} from './Icons'
export function ChecklistSheet({open,title,page,onPageChange,onClose,children}:{open:boolean;title:string;page:'todo'|'work';onPageChange:(page:'todo'|'work')=>void;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),changePage=useRef(onPageChange);changePage.current=onPageChange
 useEffect(()=>{if(!open)window.dispatchEvent(new CustomEvent('planner-client-settings',{detail:{open:false}}));if(open&&!ref.current?.open)ref.current?.showModal();else if(!open&&ref.current?.open)ref.current.close()},[open])
 useEffect(()=>{
  const node=ref.current;if(!open||!node)return
  let start:{x:number;y:number}|null=null,handled=false
  const begin=(event:TouchEvent)=>{handled=false;start=event.touches.length===1&&!(event.target as Element).closest('input,textarea,button,select')?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null}
  const move=(event:TouchEvent)=>{
   if(!start||event.touches.length!==1)return
   const dx=event.touches[0].clientX-start.x,dy=event.touches[0].clientY-start.y
   if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){start=null;return}
   if(Math.abs(dx)<16||Math.abs(dx)<=Math.abs(dy)*1.3)return
   if(event.cancelable)event.preventDefault()
   if(!handled&&Math.abs(dx)>=50){handled=true;start=null;if(page==='todo'&&dx>0)changePage.current('work');else if(page==='work'&&dx<0)changePage.current('todo')}
  }
  const end=()=>{start=null}
  node.addEventListener('touchstart',begin,{capture:true,passive:true})
  node.addEventListener('touchmove',move,{capture:true,passive:false})
  node.addEventListener('touchend',end,true);node.addEventListener('touchcancel',end,true)
  return()=>{node.removeEventListener('touchstart',begin,true);node.removeEventListener('touchmove',move,true);node.removeEventListener('touchend',end,true);node.removeEventListener('touchcancel',end,true)}
 },[open,page])
 return <dialog ref={ref} className="checklist-sheet" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}><header><span className="checklist-sheet-handle"/><div><h2>{title}</h2><div className="checklist-sheet-actions"><button type="button" className="checklist-add-item" onClick={()=>window.dispatchEvent(new Event('planner-add-checklist-item'))}><PlusIcon size={16}/>Add item</button><button type="button" className="icon-btn" aria-label={'Close '+title} onClick={onClose}><CloseIcon/></button></div></div></header>{children}<nav className="checklist-page-dots" aria-label="Task lists">{(['todo','work'] as const).map(value=><button type="button" key={value} aria-label={value==='todo'?'Tasks':'Work'} aria-current={page===value?'page':undefined} onClick={()=>onPageChange(value)}/>)}</nav></dialog>
}
