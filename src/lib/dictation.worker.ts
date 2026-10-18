import {env,pipeline,type AutomaticSpeechRecognitionPipeline} from '@huggingface/transformers'

env.allowLocalModels=false
if(env.backends.onnx.wasm)env.backends.onnx.wasm.numThreads=1
let model:Promise<AutomaticSpeechRecognitionPipeline>|undefined
function load(){
 model ??= pipeline('automatic-speech-recognition','Xenova/whisper-tiny.en',{
  device:'wasm',dtype:'q8',progress_callback:event=>{
   if(event.status==='progress')self.postMessage({type:'progress',file:event.file,progress:Math.round(event.progress)})
  },
 }).catch(error=>{model=undefined;throw error})
 return model
}
self.onmessage=async(event:MessageEvent<{type:'prepare'|'transcribe';audio?:Float32Array}>)=>{
 try{
  const transcriber=await load()
  if(event.data.type==='prepare'){self.postMessage({type:'ready'});return}
  const audio=event.data.audio
  if(!audio?.length)throw Error('No audio was captured. Try again.')
  const energy=audio.reduce((sum,v)=>sum+v*v,0)/audio.length
  if(energy<0.000001){self.postMessage({type:'result',text:''});return}
  const result=await transcriber(audio,{chunk_length_s:25,stride_length_s:5})
  self.postMessage({type:'result',text:(Array.isArray(result)?result[0]?.text:result.text)?.trim() || ''})
 }catch{self.postMessage({type:'error',message:'Dictation could not run. Check your connection for the model download, or try a shorter recording in an updated browser.'})}
}
