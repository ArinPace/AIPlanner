import {useEffect,useRef,type ReactNode} from 'react'
import {CloseIcon} from './Icons'
export function ChecklistSheet({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(!open)window.dispatchEvent(new CustomEvent('planner-client-settings',{detail:{open:false}}));if(open&&!ref.current?.open)ref.current?.showModal();else if(!open&&ref.current?.open)ref.current.close()},[open])
 return <dialog ref={ref} className="checklist-sheet" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}><header><span className="checklist-sheet-handle"/><div><h2>{title}</h2><button type="button" className="icon-btn" aria-label={'Close '+title} onClick={onClose}><CloseIcon/></button></div></header>{children}</dialog>
}
