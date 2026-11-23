import {drawWave,loadWave,waveState,type WaveStrand} from './flowWaveRenderer'
let canvas:OffscreenCanvas,ctx:OffscreenCanvasRenderingContext2D|null=null,strands:WaveStrand[]=[],timer:ReturnType<typeof setTimeout>|undefined
let active=false,reduced=false,elapsed=0,began=0,stillHalf=-1,ready=false
function time(){return elapsed+(active?(performance.now()-began)/1000:0)}
function stop(){if(timer!==undefined)clearTimeout(timer);timer=undefined}
function draw(){
 if(!ctx||!strands.length)return
 const t=time(),state=waveState(t)
 if(!reduced&&state.still&&stillHalf===state.half)return
 drawWave(ctx,strands,t,canvas.width,canvas.height,reduced);stillHalf=state.still?state.half:-1
 if(!ready){ready=true;postMessage({type:'ready'})}
}
function tick(){timer=undefined;if(!active||reduced||!strands.length)return;draw();timer=setTimeout(tick,waveState(time()).still?120:1000/24)}
onmessage=async({data})=>{
 if(data.type==='start'){
  canvas=data.canvas;canvas.width=data.width;canvas.height=data.height;ctx=canvas.getContext('2d')
  if(!ctx){postMessage({type:'unsupported'});return}
  active=data.active;reduced=data.reduced;began=performance.now()
  try{strands=await loadWave();stop();draw();if(active&&!reduced)tick()}catch{postMessage({type:'unavailable'})}
 }else if(data.type==='resize'){
  canvas.width=data.width;canvas.height=data.height;stillHalf=-1;draw()
 }else if(data.type==='state'){
  elapsed=time();began=performance.now();active=data.active;reduced=data.reduced;stop();stillHalf=-1
  if(reduced)draw();else if(active)tick()
 }
}
