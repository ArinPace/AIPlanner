import {useEffect,useRef} from 'react'

// Each filament is its own sampled cubic spline, rather than a transformed image.
function random(seed:number){let n=seed;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
type Point={x:number;y:number}
function cubic(a:Point,b:Point,c:Point,d:Point,t:number){const u=1-t;return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y}}
export function FlowFibres(){
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return
  const ctx=canvas.getContext('2d');if(!ctx)return
  const rng=random(240519),motion=matchMedia('(prefers-reduced-motion: reduce)')
  const strands=Array.from({length:560},(_,index)=>({index,lane:rng(),phase:rng()*Math.PI*2,speed:.35+rng()*.45,alpha:.11+rng()*.32,width:.24+rng()*.36,jitter:rng()*2-1}))
  let frame=0,visible=true,elapsed=0,previous=0
  const resize=()=>{const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(canvas.clientWidth*ratio);canvas.height=Math.round(canvas.clientHeight*ratio)}
  const observer=new ResizeObserver(()=>{resize();if(motion.matches)draw(0)});observer.observe(canvas)
  function draw(time:number){
   if(!ctx||!canvas)return
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/1000,canvas.height/1000)
   for(const strand of strands){
    const v=strand.lane,spread=(v-.5),phase=strand.phase
    // Wave silhouette: wispy lower-left tail, broad right sweep, breaking crest.
    const segments=[
     [{x:170+spread*45,y:735+spread*100},{x:365+spread*50,y:780+spread*65},{x:650+spread*110,y:780+spread*110},{x:730+spread*115,y:610+spread*120}],
     [{x:730+spread*115,y:610+spread*120},{x:850+spread*100,y:420+spread*85},{x:680+spread*110,y:170+spread*60},{x:510+spread*110,y:245+spread*70}],
     [{x:510+spread*110,y:245+spread*70},{x:420+spread*90,y:265+spread*75},{x:335+spread*85,y:320+spread*60},{x:275+spread*60,y:360+spread*55}],
     [{x:275+spread*60,y:360+spread*55},{x:180+spread*45,y:380+spread*50},{x:190+spread*25,y:470+spread*30},{x:220+spread*10,y:480+spread*15}]
    ] as Point[][]
    ctx.beginPath();let count=0
    for(let segment=0;segment<segments.length;segment++){
     const [a,b,c,d]=segments[segment]
     for(let step=0;step<=30;step++){
      const t=step/30,p=cubic(a,b,c,d,t),progress=(segment+t)/segments.length
      const envelope=Math.sin(Math.PI*progress)
      // Different phase/speed for every strand; traveling waves never move the logo as a block.
      const wave=Math.sin(progress*13-time*strand.speed+phase)*3.5+Math.sin(progress*25+time*.48+phase)*1.4
      const drift=motion.matches?0:wave*envelope
      const x=p.x+drift*(.7+v)+strand.jitter*Math.sin(progress*50)*.75
      const y=p.y+drift*Math.cos(progress*7+phase)+strand.jitter*Math.cos(progress*40)*.75
      if(count++===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)
     }
    }
    const light=motion.matches?1:.8+.2*Math.sin(time*.7+phase)
    ctx.strokeStyle=`rgba(235,225,204,${strand.alpha*light})`;ctx.lineWidth=strand.width;ctx.stroke()
   }
   ctx.restore()
  }
  function tick(now:number){if(previous&&visible)elapsed+=Math.min(now-previous,50)/1000;previous=now;if(visible)draw(elapsed);if(!motion.matches)frame=requestAnimationFrame(tick)}
  const restart=()=>{cancelAnimationFrame(frame);previous=0;if(motion.matches)draw(0);else frame=requestAnimationFrame(tick)}
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=0});intersection.observe(canvas)
  motion.addEventListener('change',restart);resize();restart()
  return()=>{cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();motion.removeEventListener('change',restart)}
 },[])
 return <canvas ref={ref} className="flow-fibres" aria-hidden="true"/>
}
