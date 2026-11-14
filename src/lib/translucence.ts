import {useEffect,useSyncExternalStore} from 'react'
const key='planner-translucence',event='planner-translucence-changed'
let fallback=false
function read(){try{return localStorage.getItem(key)==='on'}catch{return fallback}}
export function setTranslucence(value:boolean){fallback=value;try{localStorage.setItem(key,value?'on':'off')}catch{/* Session preference still works. */}document.documentElement.dataset.translucence=value?'on':'off';window.dispatchEvent(new Event(event))}
function subscribe(update:()=>void){window.addEventListener(event,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(event,update);window.removeEventListener('storage',update)}}
export function useTranslucence(){const value=useSyncExternalStore(subscribe,read,()=>false);useEffect(()=>{document.documentElement.dataset.translucence=value?'on':'off'},[value]);return value}
