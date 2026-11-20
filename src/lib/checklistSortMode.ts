import {useSyncExternalStore} from 'react'
export function readChecklistSort(){return localStorage.getItem('planner-checklist-sort')==='time'?'time':'urgency'}
export function toggleChecklistSort(){localStorage.setItem('planner-checklist-sort',readChecklistSort()==='time'?'urgency':'time');window.dispatchEvent(new Event('planner-checklist-sort'))}
function subscribe(fn:()=>void){window.addEventListener('planner-checklist-sort',fn);return()=>window.removeEventListener('planner-checklist-sort',fn)}
export function useChecklistSort(){return useSyncExternalStore(subscribe,readChecklistSort,()=> 'urgency')}
