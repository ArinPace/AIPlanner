import {useEffect,useRef} from 'react'
import fibreAsset from '../assets/flow-fibres.bin?url'

type Strand={layer:number;points:Float32Array;normals:Float32Array;tones:Uint8Array;flow:Float32Array;phase:number}
let geometry:Promise<Strand[]>|undefined
function loadFibres(){
 return geometry??=fetch(fibreAsset).then(async response=>{
  if(!response.ok)throw Error('Flow strand geometry unavailable')
  const bytes=await response.arrayBuffer(),view=new DataView(bytes)
  if(view.getUint32(0,false)!==0x464c5731)throw Error('Invalid Flow strand geometry')
  const count=view.getUint16(4,true),strands:Strand[]=[]
  let offset=6
  for(let strand=0;strand<count;strand++){
   const layer=view.getUint8(offset++),length=view.getUint16(offset,true);offset+=2
   const points=new Float32Array(length*2),normals=new Float32Array(length*2),tones=new Uint8Array(length),flow=new Float32Array(length*7),phase=strand*2.399963229728653
   for(let i=0;i<length;i++){
    points[i*2]=view.getUint16(offset,true)/8;points[i*2+1]=view.getUint16(offset+2,true)/8
    tones[i]=view.getUint8(offset+4);offset+=5
   }
   for(let i=0;i<length;i++){
    const before=Math.max(0,i-1)*2,after=Math.min(length-1,i+1)*2
    const dx=points[after]-points[before],dy=points[after+1]-points[before+1],size=Math.hypot(dx,dy)||1
    normals[i*2]=-dy/size;normals[i*2+1]=dx/size
    const x=points[i*2],y=points[i*2+1],angle=Math.atan2(y-500,x-500)*2.4+phase*.08
    flow.set([Math.sin(x*.014+y*.009),Math.cos(x*.014+y*.009),Math.sin(y*.022-x*.006),Math.cos(y*.022-x*.006),Math.sin(angle),Math.cos(angle),1+Math.max(0,1-Math.abs(y-360)/240)*.35],i*7)
   }
   strands.push({layer,points,normals,tones,flow,phase})
  }
  return strands
 }).catch(error=>{geometry=undefined;throw error})
}

// All visible marks are traced vector filaments. The bitmap is only a still
// fallback while geometry loads; it is never transformed to fake movement.
export function FlowFibres(){
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return
  const ctx=canvas.getContext('2d');if(!ctx)return
  const motion=matchMedia('(prefers-reduced-motion: reduce)')
  let strands:Strand[]=[],frame=0,visible=false,disposed=false,elapsed=0,previous=0,lastDraw=0
  const colors=Array.from({length:64},(_,i)=>{const l=i*4;return `rgb(${Math.min(255,Math.round(l*1.035))},${l},${Math.round(l*.925)})`})
  function draw(time:number){
   if(!ctx||!canvas||!strands.length)return
   ctx.clearRect(0,0,canvas.width,canvas.height)
   ctx.save();ctx.scale(canvas.width/1024,canvas.height/1024)
   ctx.lineCap='round';ctx.lineJoin='round'
   // Batch equal tones, keeping the full per-point deformation of every fibre.
   // This avoids thousands of separate strokes on each mobile animation frame.
   const paths=Array.from({length:192},()=>new Path2D())
   const moving=!motion.matches
   const aSin=Math.sin(-time*.72),aCos=Math.cos(-time*.72),bSin=Math.sin(time*.46),bCos=Math.cos(time*.46),lightSin=Math.sin(time*.75),lightCos=Math.cos(time*.75)
   for(const strand of strands){
    const {points,normals,tones,flow,phase,layer}=strand
    const breath=Math.sin(time*.68+phase),ripple=Math.sin(time*.43+phase*1.7)
    let previousX=0,previousY=0,lastBucket=-1
    for(let i=0;i<tones.length;i++){
     const x=points[i*2],y=points[i*2+1]
     // A shared, slowly travelling flow keeps neighbouring hairs coherent;
     // strand-specific oscillation lets each one flex rather than moving a tile.
     const f=i*7
     const displacement=moving?((flow[f]*aCos+flow[f+1]*aSin)*1.65+(flow[f+2]*bCos+flow[f+3]*bSin)*.65+breath*.45+ripple*.22)*flow[f+6]:0
     const px=x+normals[i*2]*displacement,py=y+normals[i*2+1]*displacement
     if(i){
      const light=moving?1+.055*(flow[f+4]*lightCos+flow[f+5]*lightSin):1
      const tone=(tones[i]+tones[i-1])*.5*(layer===1?.96:.98)*light
      const bucket=layer*64+Math.max(0,Math.min(63,Math.round(tone/4)))
      if(bucket!==lastBucket)paths[bucket].moveTo(previousX,previousY)
      paths[bucket].lineTo(px,py);lastBucket=bucket
     }
     previousX=px;previousY=py
    }
   }
   for(let layer=0;layer<3;layer++){
    ctx.lineWidth=layer?.6:1.05;ctx.globalAlpha=layer===1?.75:1
    for(let tone=0;tone<64;tone++){ctx.strokeStyle=colors[tone];ctx.stroke(paths[layer*64+tone])}
   }
   ctx.restore()
   canvas.dataset.ready='true'
  }
  function tick(now:number){
   frame=0
   if(disposed||!visible||document.hidden||motion.matches||!strands.length)return
   if(previous)elapsed+=Math.min(now-previous,80)/1000
   previous=now
   if(now-lastDraw>=1000/30){draw(elapsed);lastDraw=now}
   frame=requestAnimationFrame(tick)
  }
  function restart(){
   cancelAnimationFrame(frame);frame=0;previous=0
   if(disposed||!strands.length)return
   if(motion.matches){draw(0);return}
   if(visible&&!document.hidden)frame=requestAnimationFrame(tick)
  }
  function resize(){
   const ratio=Math.min(devicePixelRatio||1,3)
   canvas!.width=Math.max(1,Math.round(canvas!.clientWidth*ratio));canvas!.height=Math.max(1,Math.round(canvas!.clientHeight*ratio))
   draw(motion.matches?0:elapsed)
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas)
  const intersection=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);restart()});intersection.observe(canvas)
  motion.addEventListener('change',restart);document.addEventListener('visibilitychange',restart)
  void loadFibres().then(value=>{if(disposed)return;strands=value;resize();restart()}).catch(()=>{/* Keep the actual still logo visible if its vector asset could not load. */})
  resize()
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();motion.removeEventListener('change',restart);document.removeEventListener('visibilitychange',restart)}
 },[])
 return <canvas ref={ref} className="flow-fibres" aria-hidden="true"/>
}
