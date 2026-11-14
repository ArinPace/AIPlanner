import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'

export function ComposerModelPicker({label,tab,active,disabled,children,iconOnly=false}:{iconOnly?:boolean;label:string;tab:'Agent'|'Chat';active:boolean;disabled?:boolean;children:ReactNode}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:12,bottom:80,width:340,maxHeight:420})
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!active)setOpen(false)},[active])
 useLayoutEffect(()=>{
  if(!open)return
  const place=()=>{const rect=trigger.current?.getBoundingClientRect();if(!rect)return;const width=Math.min(360,window.innerWidth-24);setPosition({width,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),bottom:Math.max(12,window.innerHeight-rect.top+8),maxHeight:Math.max(60,Math.min(520,rect.top-24))})}
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.visualViewport?.addEventListener('resize',place)
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place)}
 },[open])
 useEffect(()=>{
  if(!open)return
  const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))setOpen(false)}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus()}}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape)}
 },[open])
 return <><button ref={trigger} type="button" className={'composer-model-trigger'+(iconOnly?' is-icon-only':'')} aria-label={tab+' model options'} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(value=>!value)}>{iconOnly?<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--panel)"/><circle cx="15" cy="17" r="3" fill="var(--panel)"/></svg>:<><span>{label}</span><span aria-hidden="true">⌄</span></>}</button>{open&&active&&createPortal(<div ref={popup} role="dialog" aria-label={tab+' model controls'} className="composer-model-popup" style={position}><button type="button" className="composer-model-close" aria-label="Close model controls" onClick={()=>{setOpen(false);trigger.current?.focus()}}>×</button>{children}</div>,document.body)}</>
}
