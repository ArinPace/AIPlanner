import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {PlusIcon} from './Icons'

export function FilesAddMenu({compact=false,busy,actions}:{compact?:boolean;busy:boolean;actions:{label:string;run:()=>void}[]}){
  const [open,setOpen]=useState(false)
  const [anchor,setAnchor]=useState({left:0,top:0,maxHeight:400})
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const menu=useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{
    if(!open)return
    const position=()=>{
      if(!trigger.current || !menu.current)return
      const rect=trigger.current.getBoundingClientRect(),width=menu.current.getBoundingClientRect().width
      const below=window.innerHeight-rect.bottom-14,above=rect.top-14
      const height=Math.min(menu.current.scrollHeight,window.innerHeight-16)
      const flip=height>below && above>below
      const maxHeight=Math.max(0,flip?above:below)
      setAnchor({left:Math.max(8,Math.min(compact?rect.right-width:rect.left,window.innerWidth-width-8)),top:flip?Math.max(8,rect.top-6-Math.min(height,maxHeight)):rect.bottom+6,maxHeight})
    }
    const scroll=(event:Event)=>{if(!menu.current?.contains(event.target as Node))position()}
    position();window.addEventListener('resize',position);document.addEventListener('scroll',scroll,true)
    return()=>{window.removeEventListener('resize',position);document.removeEventListener('scroll',scroll,true)}
  },[open,compact])
  useEffect(()=>{
    if(!open)return
    menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('mousedown',close);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)}
  },[open])
  const popup=open&&<div ref={menu} className="files-add-menu" role="menu" aria-label="Add new item" style={{position:'fixed',left:anchor.left,top:anchor.top,maxHeight:anchor.maxHeight,right:'auto',zIndex:200}}>{actions.map(action=><button key={action.label} type="button" role="menuitem" onClick={()=>{setOpen(false);action.run()}}>{action.label}</button>)}</div>
  return <div ref={root} className={'files-add'+(compact?' files-sidebar-add':'')}>
    <button ref={trigger} type="button" className={compact?'icon-btn':'primary-btn'} disabled={busy} aria-label={compact?'Add item in sidebar':undefined} title={compact?'Add new item':undefined} aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(value=>!value)}><PlusIcon size={compact?24:16}/>{!compact&&'Add new'}</button>
    {createPortal(popup,document.body)}
  </div>
}
