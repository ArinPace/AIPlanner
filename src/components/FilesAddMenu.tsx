import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {PlusIcon} from './Icons'

export function FilesAddMenu({compact=false,busy,actions}:{compact?:boolean;busy:boolean;actions:{label:string;run:()=>void}[]}){
  const [open,setOpen]=useState(false)
  const [anchor,setAnchor]=useState({left:0,top:0})
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const menu=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('mousedown',close);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)}
  },[open])
  const popup=open&&<div ref={menu} className="files-add-menu" role="menu" aria-label="Add new item" style={compact?{position:'fixed',left:anchor.left,top:anchor.top,right:'auto',zIndex:200}:undefined}>{actions.map(action=><button key={action.label} type="button" role="menuitem" onClick={()=>{setOpen(false);action.run()}}>{action.label}</button>)}</div>
  return <div ref={root} className={'files-add'+(compact?' files-sidebar-add':'')}>
    <button ref={trigger} type="button" className={compact?'icon-btn':'primary-btn'} disabled={busy} aria-label={compact?'Add item in sidebar':undefined} title={compact?'Add new item':undefined} aria-expanded={open} aria-haspopup="menu" onClick={()=>{const rect=trigger.current!.getBoundingClientRect();setAnchor({left:Math.max(8,Math.min(rect.right-210,window.innerWidth-218)),top:rect.bottom+6});setOpen(value=>!value)}}><PlusIcon size={compact?24:16}/>{!compact&&'Add new'}</button>
    {compact?createPortal(popup,document.body):popup}
  </div>
}
