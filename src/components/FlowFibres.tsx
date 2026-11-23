import {useEffect,useRef,useState} from 'react'

// A small poster is immediate. Geometry and animation start only after idle time,
// and never gate the calendar request or completion of the loading screen.
export function FlowFibres(){
 const ref=useRef<HTMLCanvasElement>(null),[mainThread,setMainThread]=useState(false)
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return
  const motion=matchMedia('(prefers-reduced-motion: reduce)')
  let worker:Worker|undefined,disposed=false,visible=false,started=false,frame=0,elapsed=0,previous=0,lastDraw=0,stillHalf=-1
  let idle:number|undefined,startTimer:ReturnType<typeof setTimeout>|undefined
  let fallback:Awaited<ReturnType<typeof import('../lib/flowWaveRenderer')['loadWave']>>|undefined
  let renderer:typeof import('../lib/flowWaveRenderer')|undefined
  const size=()=>({width:Math.max(1,Math.round(canvas.clientWidth*Math.min(devicePixelRatio||1,2))),height:Math.max(1,Math.round(canvas.clientHeight*Math.min(devicePixelRatio||1,2)))})
  const active=()=>visible&&!document.hidden
  function tick(now:number){
   frame=0
   if(disposed||!active()||!fallback||!renderer)return
   if(previous)elapsed+=Math.min(now-previous,100)/1000
   previous=now
   const state=renderer.waveState(elapsed)
   if(now-lastDraw>=1000/24&&(!state.still||state.half!==stillHalf||motion.matches)){
    const ctx=canvas!.getContext('2d')
    if(ctx){renderer.drawWave(ctx,fallback,elapsed,canvas!.width,canvas!.height,motion.matches);canvas!.dataset.ready='true'}
    stillHalf=state.still?state.half:-1;lastDraw=now
   }
   if(!motion.matches)frame=requestAnimationFrame(tick)
  }
  async function start(){
   if(disposed||started||motion.matches||!active())return
   started=true
   if(!mainThread&&typeof Worker!=='undefined'&&typeof canvas!.transferControlToOffscreen==='function'){
    try{
     worker=new Worker(new URL('../lib/flowWave.worker.ts',import.meta.url),{type:'module'})
     worker.onmessage=({data})=>{if(disposed)return;if(data.type==='ready')canvas!.dataset.ready='true';else if(data.type==='unsupported')setMainThread(true)}
     worker.onerror=()=>{if(!disposed)setMainThread(true)}
     const offscreen=canvas!.transferControlToOffscreen()
     worker.postMessage({type:'start',canvas:offscreen,...size(),active:active(),reduced:motion.matches},[offscreen])
     return
    }catch{worker?.terminate();worker=undefined;setMainThread(true);return}
   }
   try{
    const module=await import('../lib/flowWaveRenderer'),strands=await module.loadWave()
    if(disposed)return
    renderer=module;fallback=strands;resize();update()
   }catch{/* Keep the still logo if animation assets are unavailable. */}
  }
  function update(){
   previous=0;cancelAnimationFrame(frame);frame=0
   if(worker)worker.postMessage({type:'state',active:active(),reduced:motion.matches})
   else if(fallback){if(active())frame=requestAnimationFrame(tick)}
   else if(!started&&!motion.matches&&active()&&startTimer===undefined)startTimer=setTimeout(schedule,200)
  }
  function schedule(){
   startTimer=undefined
   if(disposed||motion.matches||!active())return
   if('requestIdleCallback'in window)idle=window.requestIdleCallback(()=>{idle=undefined;void start()},{timeout:1000})
   else void start()
  }
  function resize(){
   const dimensions=size()
   if(worker)worker.postMessage({type:'resize',...dimensions})
   else{canvas!.width=dimensions.width;canvas!.height=dimensions.height;if(fallback&&renderer){const ctx=canvas!.getContext('2d');if(ctx)renderer.drawWave(ctx,fallback,elapsed,dimensions.width,dimensions.height,motion.matches)}}
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas)
  const intersection=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);update()});intersection.observe(canvas)
  motion.addEventListener('change',update);document.addEventListener('visibilitychange',update)
  resize();update()
  return()=>{disposed=true;if(startTimer!==undefined)clearTimeout(startTimer);if(idle!==undefined)window.cancelIdleCallback(idle);cancelAnimationFrame(frame);worker?.terminate();observer.disconnect();intersection.disconnect();motion.removeEventListener('change',update);document.removeEventListener('visibilitychange',update)}
 },[mainThread])
 return <canvas key={mainThread?'fallback':'worker'} ref={ref} className="flow-fibres" aria-hidden="true"/>
}
