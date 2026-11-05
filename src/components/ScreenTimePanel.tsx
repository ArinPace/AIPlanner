import {CloudScreenTime} from './CloudScreenTime'
import {useLayoutEffect, useRef, useState} from 'react'
import {nativeRequest} from '../lib/platform'

/** The native controls occupy this panel; the signed-in web header remains interactive. */
function NativeScreenTimePanel(){
 const host=useRef<HTMLDivElement>(null)
 const [error,setError]=useState('')
 useLayoutEffect(()=>{
  const node=host.current
  if(!node)return
  let active=true
  const update=()=>{
   const rect=node.getBoundingClientRect()
   void nativeRequest({action:'screenTimePanel',visible:true,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not open Screen Time.')})
  }
  const resize=new ResizeObserver(update)
  resize.observe(node)
  window.addEventListener('resize',update)
  update()
  return ()=>{
   active=false
   resize.disconnect()
   window.removeEventListener('resize',update)
   void nativeRequest({action:'screenTimePanel',visible:false}).catch(()=>{})
  }
 },[])
 return <div ref={host} className="agent-tab-panel" aria-label="Screen Time">{error&&<p role="alert" className="form-error">{error}</p>}</div>
}

export function ScreenTimePanel(){
 const [mode,setMode]=useState<'cloud'|'native'>('cloud')
 return <div className="agent-tab-panel"><div><button type="button" aria-pressed={mode==='cloud'} onClick={()=>setMode('cloud')}>Cloud blocking</button>{window.plannerNativeScreenTime&&<button type="button" aria-pressed={mode==='native'} onClick={()=>setMode('native')}>Apple Screen Time</button>}</div>{mode==='cloud'?<CloudScreenTime/>:<NativeScreenTimePanel/>}</div>
}
