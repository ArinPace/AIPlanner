import {useSyncExternalStore} from 'react'
export type CalendarRowControls='right'|'left'
const key='planner-calendar-row-controls',event='planner-calendar-row-controls-changed'
let transient:CalendarRowControls|undefined
export function readCalendarRowControls():CalendarRowControls{try{return transient??(localStorage.getItem(key)==='left'?'left':'right')}catch{return transient??'right'}}
export function setCalendarRowControls(value:CalendarRowControls){try{localStorage.setItem(key,value);transient=undefined}catch{transient=value}window.dispatchEvent(new Event(event))}
function subscribe(update:()=>void){window.addEventListener(event,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(event,update);window.removeEventListener('storage',update)}}
export function useCalendarRowControls(){return useSyncExternalStore(subscribe,readCalendarRowControls,()=>'right')}
