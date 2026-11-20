import {useSyncExternalStore} from 'react'
const key='planner-show-intensity',event='planner-show-intensity-changed'
let fallback=false
function read(){try{return localStorage.getItem(key)==='on'}catch{return fallback}}
export function setShowIntensity(value:boolean){fallback=value;try{localStorage.setItem(key,value?'on':'off')}catch{/* Keep the preference for this session. */}window.dispatchEvent(new Event(event))}
function subscribe(update:()=>void){window.addEventListener(event,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(event,update);window.removeEventListener('storage',update)}}
export function useShowIntensity(){return useSyncExternalStore(subscribe,read,()=>false)}
