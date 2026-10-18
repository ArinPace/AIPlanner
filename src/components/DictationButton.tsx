import {useCallback,useEffect,useRef,useState} from 'react'

type Phase='idle'|'loading'|'permission'|'listening'|'transcribing'
export function DictationButton({enabled,onText,onBusy}:{enabled:boolean;onText:(text:string)=>void;onBusy:(busy:boolean)=>void}){
 const [phase,setPhase]=useState<Phase>('idle'),[notice,setNotice]=useState(''),[seconds,setSeconds]=useState(0)
 const worker=useRef<Worker|null>(null),stream=useRef<MediaStream|null>(null),recorder=useRef<MediaRecorder|null>(null)
 const timer=useRef<ReturnType<typeof setInterval>|undefined>(undefined),generation=useRef(0)
 const callbacks=useRef({onText,onBusy})
 useEffect(()=>{callbacks.current={onText,onBusy}},[onText,onBusy])
 const release=useCallback(()=>{
  clearInterval(timer.current)
  if(recorder.current){recorder.current.onstop=null;if(recorder.current.state!=='inactive')recorder.current.stop();recorder.current=null}
  stream.current?.getTracks().forEach(t=>t.stop());stream.current=null
 },[])
 const cancel=useCallback(()=>{
  generation.current++;release();worker.current?.terminate();worker.current=null
  setPhase('idle');callbacks.current.onBusy(false)
 },[release])
 useEffect(()=>{const timeout=enabled?undefined:setTimeout(cancel,0);return()=>{clearTimeout(timeout);cancel()}},[enabled,cancel])
 async function capture(id:number){
  setPhase('permission');setNotice('Allow microphone access to dictate. Audio stays on this device.')
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})
   if(id!==generation.current){media.getTracks().forEach(t=>t.stop());return}
   stream.current=media
   const recording=new MediaRecorder(media),chunks:Blob[]=[];recorder.current=recording
   recording.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
   recording.onerror=()=>{cancel();setNotice('Microphone capture failed. Please try again.')}
   recording.onstop=async()=>{
    clearInterval(timer.current);media.getTracks().forEach(t=>t.stop());stream.current=null;recorder.current=null
    if(id!==generation.current)return
    setPhase('transcribing');setNotice('Transcribing on your device…')
    let context:AudioContext|undefined
    try{
     context=new AudioContext()
     const decoded=await context.decodeAudioData(await new Blob(chunks,{type:recording.mimeType}).arrayBuffer())
     const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource()
     source.buffer=decoded;source.connect(offline.destination);source.start()
     const audio=(await offline.startRendering()).getChannelData(0)
     if(id===generation.current)worker.current?.postMessage({type:'transcribe',audio},[audio.buffer])
    }catch{if(id===generation.current){cancel();setNotice('This browser could not process the microphone audio. Try an updated Chrome, Edge or Safari.')}}
    finally{await context?.close().catch(()=>{})}
   }
   recording.start(1000);setSeconds(0);setPhase('listening');setNotice('Listening · English · audio is not saved')
   let elapsed=0;timer.current=setInterval(()=>{elapsed++;setSeconds(elapsed);if(elapsed>=120 && recording.state==='recording')recording.stop()},1000)
  }catch(error){if(id===generation.current){cancel();setNotice(error instanceof DOMException && error.name==='NotAllowedError'?'Microphone access was denied. Allow it in your browser’s site settings to use dictation.':'No usable microphone was found. Check your microphone and browser permissions.')}}
 }
 function start(){
  if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){setNotice('Dictation needs microphone support and a secure HTTPS connection.');return}
  const id=++generation.current
  callbacks.current.onBusy(true);setPhase('loading');setNotice('Loading Whisper for local dictation. The first download may take a minute…')
  worker.current?.terminate()
  const engine=new Worker(new URL('../lib/dictation.worker.ts',import.meta.url),{type:'module'})
  engine.onmessage=event=>{
   if(id!==generation.current)return
   const data=event.data
   if(data.type==='progress')setNotice(`Downloading speech model: ${data.progress}% of ${data.file}…`)
   else if(data.type==='ready')void capture(id)
   else if(data.type==='result'){
    engine.terminate();worker.current=null
    setPhase('idle');callbacks.current.onBusy(false)
    if(data.text){callbacks.current.onText(data.text);setNotice('Dictation added to your draft. Review it before sending.')}
    else setNotice('No speech detected. Please try again.')
   }else if(data.type==='error'){cancel();setNotice(data.message)}
  }
  engine.onerror=()=>{cancel();setNotice('Local dictation could not start. Try reloading or updating your browser.')}
  worker.current=engine
  engine.postMessage({type:'prepare'})
 }
 return <div className="dictation-control">
  <button type="button" className={'dictation-button'+(phase==='listening'?' is-listening':'')} disabled={!enabled || ['loading','permission','transcribing'].includes(phase)} aria-label={phase==='listening'?'Stop dictation':'Start dictation'} title="Dictate in English with Whisper, on your device" onClick={()=>phase==='listening'?recorder.current?.stop():start()}>
   {phase==='listening'?<><span aria-hidden="true">■</span> {seconds}s</>:<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>}
  </button>
  {phase!=='idle' && <button type="button" className="dictation-cancel" onClick={()=>{cancel();setNotice('Dictation cancelled.')}}>Cancel</button>}
  <span role="status" className="dictation-status">{notice}</span>
 </div>
}
