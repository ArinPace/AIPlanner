import {useLayoutEffect,useState,type ReactNode} from 'react'
import {useFolderAnimations} from '../lib/folderAnimations'
export function FolderReveal({open,children}:{open:boolean;children:()=>ReactNode}){
 const animated=useFolderAnimations(),[present,setPresent]=useState(open),[expanded,setExpanded]=useState(false),[settled,setSettled]=useState(false)
 useLayoutEffect(()=>{
  let first=0,second=0
  if(!animated){setPresent(open);setExpanded(open);setSettled(true);return}
  setSettled(false)
  if(open){setPresent(true);first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>setExpanded(true))})}
  else setExpanded(false)
  const timer=window.setTimeout(()=>{if(!open)setPresent(false);setSettled(true)},520)
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);clearTimeout(timer)}
 },[open,animated])
 if(!(animated?present:open))return null
 return <div className={'calendar-folder-reveal'+((animated?expanded:open)?' is-open':'')+(!settled&&animated?' is-animating':'')} data-animated={animated} inert={!open} onTransitionEnd={event=>{if(event.target!==event.currentTarget||event.propertyName!=='grid-template-rows')return;if(!open)setPresent(false);setSettled(true)}}><div className="calendar-folder-reveal-body">{children()}</div></div>
}
