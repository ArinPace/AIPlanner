import fibreAsset from '../assets/flow-wave.bin?url'
export type WaveStrand={points:Float32Array;flat:Float32Array;normals:Float32Array;tones:Uint8Array;layer:number;phase:number}
const clamp=(n:number)=>Math.max(0,Math.min(1,n))
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t)}
export function waveState(time:number){
 const half=Math.floor(time/8),t=time-half*8,direction=half%2===0?1:-1
 if(t<1.6)return {direction,sea:0,crash:0,travel:40*Math.sin(t/3*Math.PI),still:false,phase:'wave',half}
 if(t<3){const p=(t-1.6)/1.4;return {direction,sea:ease(p),crash:Math.sin(p*Math.PI),travel:40*Math.sin(t/3*Math.PI),still:false,phase:'crash',half}}
 if(t<6.5)return {direction,sea:1,crash:0,travel:0,still:t>=3.5,phase:'ocean',half}
 return {direction:-direction,sea:1-ease((t-6.5)/1.5),crash:0,travel:0,still:false,phase:'rise',half}
}
export async function loadWave():Promise<WaveStrand[]>{
 const response=await fetch(fibreAsset)
 if(!response.ok)throw Error('Wave geometry unavailable')
 const view=new DataView(await response.arrayBuffer())
 if(view.getUint32(0,false)!==0x464c5732)throw Error('Invalid wave geometry')
 const count=view.getUint16(4,true),strands:WaveStrand[]=[]
 let offset=6
 for(let strand=0;strand<count;strand++){
  const layer=view.getUint8(offset++),length=view.getUint16(offset,true);offset+=2
  const points=new Float32Array(length*2),flat=new Float32Array(length*2),normals=new Float32Array(length*2),tones=new Uint8Array(length),phase=strand*2.3999632297
  for(let i=0;i<length;i++){points[i*2]=view.getUint16(offset,true)/8;points[i*2+1]=view.getUint16(offset+2,true)/8;tones[i]=view.getUint8(offset+4);offset+=5}
  const level=710+Math.sin(phase)*24+Math.cos(phase*1.7)*8
  for(let i=0;i<length;i++){
   const x=points[i*2],y=points[i*2+1]
   let angle=Math.atan2(y-500,x-500)
   if(angle>2.65)angle-=Math.PI*2
   flat[i*2]=900-clamp((2.5-angle)/5.7)*780;flat[i*2+1]=level+Math.sin(x*.012+phase)*.4
   const before=Math.max(0,i-1)*2,after=Math.min(length-1,i+1)*2,dx=points[after]-points[before],dy=points[after+1]-points[before+1],size=Math.hypot(dx,dy)||1
   normals[i*2]=-dy/size;normals[i*2+1]=dx/size
  }
  strands.push({points,flat,normals,tones,layer,phase})
 }
 return strands
}
type Context=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D
const colors=Array.from({length:32},(_,i)=>{const l=i*8;return `rgb(${Math.min(255,Math.round(l*1.035))},${l},${Math.round(l*.925)})`})
export function drawWave(ctx:Context,strands:WaveStrand[],time:number,width:number,height:number,reduced=false){
 const state=waveState(reduced?0:time)
 ctx.clearRect(0,0,width,height);ctx.save();ctx.scale(width/1024,height/1024);ctx.lineCap='round';ctx.lineJoin='round'
 // A quiet bed of independent water filaments remains after the crest breaks.
 // Its geometry is symmetric, so changing the next wave's direction is seamless.
 if(state.sea>0){
  ctx.lineWidth=.9
  const ink=ctx.createLinearGradient(120,0,904,0)
  ink.addColorStop(0,'rgba(224,216,201,0)');ink.addColorStop(.18,'rgb(224,216,201)');ink.addColorStop(.82,'rgb(224,216,201)');ink.addColorStop(1,'rgba(224,216,201,0)')
  for(let lane=0;lane<64;lane++){
   const phase=lane*2.3999632297,level=698+lane/63*24,settling=state.still?0:Math.max(0,1-state.sea)*4
   ctx.globalAlpha=state.sea*(.055+.025*Math.sin(phase)**2)
   ctx.strokeStyle=ink;ctx.beginPath()
   for(let step=0;step<=40;step++){
    const u=step/40,x=120+u*784,y=level+Math.sin(u*Math.PI)*Math.sin(u*9+phase)*(.5+settling)
    if(step===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)
   }
   ctx.stroke()
  }
 }

 const paths=Array.from({length:96},()=>new Path2D())
 for(const {points,flat,normals,tones,layer,phase} of strands){
  let previousX=0,previousY=0,previousBucket=-1
  const sway=reduced?0:Math.sin(time*Math.PI/8+phase)*1.5
  for(let i=0;i<tones.length;i++){
   const x=points[i*2],y=points[i*2+1],crest=clamp((600-y)/400)*clamp((650-x)/450)
   const sea=clamp(state.sea+state.crash*crest*.12)
   const sourceX=x-state.travel-crest*state.crash*100+normals[i*2]*sway,sourceY=y+crest*state.crash*130+normals[i*2+1]*sway
   const waveX=state.direction===1?sourceX:1024-sourceX
   const seaX=state.direction===1?flat[i*2]:1024-flat[i*2]
   const px=waveX*(1-sea)+seaX*sea,py=sourceY*(1-sea)+flat[i*2+1]*sea
   if(i){
    const tone=(tones[i]+tones[i-1])*.49,bucket=layer*32+Math.max(0,Math.min(31,Math.round(tone/8)))
    if(bucket!==previousBucket)paths[bucket].moveTo(previousX,previousY)
    paths[bucket].lineTo(px,py);previousBucket=bucket
   }
   previousX=px;previousY=py
  }
 }
 for(let layer=0;layer<3;layer++){
  ctx.lineWidth=layer?.9:3.2;ctx.globalAlpha=(layer===1?.75:1)*(1-state.sea)
  for(let tone=0;tone<32;tone++){ctx.strokeStyle=colors[tone];ctx.stroke(paths[layer*32+tone])}
 }
 // A few fine spray filaments follow the breaking crest into the ocean.
 if(state.crash>.05){
  ctx.globalAlpha=state.crash*.35;ctx.strokeStyle='rgb(228,220,204)';ctx.lineWidth=1
  for(let i=0;i<36;i++){
   const seed=i*2.3999632297,p=state.sea,spread=Math.sin(seed)*150*p
   const x=(220-state.travel-state.crash*30)*(1-p)+(330+spread)*p,y=430*(1-p)+710*p-Math.sin(p*Math.PI)*(40+Math.cos(seed)*30)
   const sx=state.direction===1?x:1024-x
   ctx.beginPath();ctx.moveTo(sx,y);ctx.lineTo(sx+Math.cos(seed)*5,y+5+Math.sin(seed)*5);ctx.stroke()
  }
 }
 ctx.restore()
 return state
}
