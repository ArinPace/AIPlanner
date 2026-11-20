import {useEffect,useState} from 'react'
import {planningRequest} from './api'
import {type IntensityCalibration} from './intensityCalibrationModel'
export function useIntensityCalibration(username:string){
 const key='planner-intensity-calibration:'+username
 const [value,setValue]=useState<Partial<IntensityCalibration>>(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}})
 useEffect(()=>{let alive=true;setValue((()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}})());const read=()=>void planningRequest<{profile:{intensityCalibration?:IntensityCalibration}}>().then(row=>{if(alive){const next=row.profile.intensityCalibration||{};setValue(next);localStorage.setItem(key,JSON.stringify(next))}}).catch(()=>{});read();const timer=setInterval(read,60000);window.addEventListener('planner-intensity-refresh',read);window.addEventListener('focus',read);return()=>{alive=false;clearInterval(timer);window.removeEventListener('planner-intensity-refresh',read);window.removeEventListener('focus',read)}},[key])
 return value
}
