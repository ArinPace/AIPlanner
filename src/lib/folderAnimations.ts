import {useSyncExternalStore} from 'react'
const key='planner-folder-animations',event='planner-folder-animations-changed'
let transient:boolean|undefined
export function readFolderAnimations(){try{return transient??(localStorage.getItem(key)!=='off')}catch{return transient??true}}
export function setFolderAnimations(enabled:boolean){try{localStorage.setItem(key,enabled?'on':'off');transient=undefined}catch{transient=enabled}window.dispatchEvent(new CustomEvent(event,{detail:enabled}))}
function enabled(){return readFolderAnimations()&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches}
function subscribe(update:()=>void){const media=window.matchMedia('(prefers-reduced-motion: reduce)');window.addEventListener(event,update);window.addEventListener('storage',update);media.addEventListener('change',update);return()=>{window.removeEventListener(event,update);window.removeEventListener('storage',update);media.removeEventListener('change',update)}}
export function useFolderAnimations(){return useSyncExternalStore(subscribe,enabled,()=>false)}
