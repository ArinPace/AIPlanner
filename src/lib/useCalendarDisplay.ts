import {useEffect,useRef,useState} from 'react'
import {calendarDisplayRequest} from './api'
import {defaultCalendarDisplay,type CalendarDisplay} from './calendarDisplay'
export function useCalendarDisplay(username:string){
 const key='planner-calendar-display:'+username
 const [settings,setSettings]=useState<CalendarDisplay>(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'{}');return {week:saved.week===true,month:saved.month===true}}catch{return defaultCalendarDisplay}})
 const [saving,setSaving]=useState(false),[error,setError]=useState('')
 const version=useRef(0),alive=useRef(true),inFlight=useRef(false)
 const cache=(value:CalendarDisplay)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{/* The cloud copy remains authoritative. */}}
 useEffect(()=>{
  alive.current=true
  const read=async()=>{if(inFlight.current)return;const generation=++version.current;try{const result=await calendarDisplayRequest();if(alive.current&&generation===version.current){setSettings(result);cache(result);setError('')}}catch(e){if(alive.current&&generation===version.current)setError(e instanceof Error?e.message:'Display settings could not sync.')}}
  void read();window.addEventListener('focus',read);window.addEventListener('planner-preferences-refresh',read)
  return()=>{alive.current=false;window.removeEventListener('focus',read);window.removeEventListener('planner-preferences-refresh',read)}
 },[username])
 async function change(view:keyof CalendarDisplay,value:boolean){
  if(inFlight.current)return
  inFlight.current=true;version.current++;setSaving(true);setError('')
  const previous=settings;setSettings({...settings,[view]:value})
  try{const result=await calendarDisplayRequest({[view]:value});if(alive.current){setSettings(result);cache(result)}}
  catch(e){if(alive.current){setSettings(previous);setError(e instanceof Error?e.message:'Could not save display settings.')}}
  finally{inFlight.current=false;if(alive.current)setSaving(false)}
 }
 return {settings,saving,error,change}
}
