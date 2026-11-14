import {useSyncExternalStore} from 'react'
const query='(min-width: 700px)'
function subscribe(update:()=>void){const media=window.matchMedia(query);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)}
export function useMultiDayCount(){return useSyncExternalStore(subscribe,()=>window.matchMedia(query).matches?3:2,()=>2)}
