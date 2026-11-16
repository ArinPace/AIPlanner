import {useLayoutEffect,useState,type ReactNode,type CSSProperties} from 'react'
import {useFolderAnimations} from '../lib/folderAnimations'
export function FolderReveal({open,children,axis='vertical',style}:{open:boolean;children:()=>ReactNode;axis?:'vertical'|'horizontal';style?:CSSProperties}){
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
 return <div className={'calendar-folder-reveal'+(axis==='horizontal'?' is-horizontal':'')+((animated?expanded:open)?' is-open':'')+(!settled&&animated?' is-animating':'')} style={style} data-animated={animated} inert={!open} onTransitionEnd={event=>{if(event.target!==event.currentTarget||event.propertyName!==(axis==='horizontal'?'width':'grid-template-rows'))return;if(!open)setPresent(false);setSettled(true)}}><div className="calendar-folder-reveal-body">{children()}</div></div>
}
