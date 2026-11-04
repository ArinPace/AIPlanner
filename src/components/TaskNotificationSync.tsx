import {useEffect,useMemo,useState} from 'react'
import {taskNotificationsRequest} from '../lib/api'
import {DEFAULT_TASK_NOTIFICATIONS,taskNotificationPlan,type TaskNotificationSettings} from '../lib/taskNotifications'
import {isIPhoneApp,nativeRequest} from '../lib/platform'
import {widgetSnapshot} from '../lib/widgetSnapshot'
import {TASK_NOTIFICATIONS_CHANGED} from './TaskNotificationSettings'
import type {StoredState} from '../types'
export function TaskNotificationSync({username,calendar}:{username:string;calendar:StoredState}){
 const [settings,setSettings]=useState<TaskNotificationSettings>(DEFAULT_TASK_NOTIFICATIONS),[loaded,setLoaded]=useState(false)
 const snapshot=useMemo(()=>!isIPhoneApp()&&settings.enabled?widgetSnapshot(calendar.events,undefined,calendar.tags):null,[calendar.events,calendar.tags,settings.enabled])
 useEffect(()=>{
  let active=true;setLoaded(false)
  const load=()=>void taskNotificationsRequest().then(value=>{if(active){setSettings(value);setLoaded(true)}}).catch(()=>{})
  const changed=(e:Event)=>{setSettings((e as CustomEvent<TaskNotificationSettings>).detail);setLoaded(true)}
  load();const timer=setInterval(load,60000);window.addEventListener('focus',load);window.addEventListener(TASK_NOTIFICATIONS_CHANGED,changed)
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener(TASK_NOTIFICATIONS_CHANGED,changed)}
 },[username])
 useEffect(()=>{
  if(!loaded)return
  if(isIPhoneApp()){void nativeRequest({action:'taskNotificationSettings',account:username,settings}).catch(()=>{});return}
  if(!settings.enabled||!snapshot||!('Notification' in window))return
  const started=Date.now()/1000,plan=taskNotificationPlan(snapshot.events,settings,started,snapshot.validUntil)
  const delivered=new Set<string>()
  const tick=()=>{
   if(Notification.permission!=='granted')return
   const now=Date.now()/1000
   for(const notice of plan.filter(n=>n.at<=now&&n.at>now-15)){
    const key='planner-task-notice:'+username+':'+notice.id
    if(delivered.has(key))continue
    delivered.add(key)
    try{if(localStorage.getItem(key))continue;localStorage.setItem(key,String(now))}catch{/* Notifications remain usable without persistent storage. */}
    try{const notification=new Notification(notice.title,{body:notice.body,tag:key});notification.onclick=()=>{window.focus();notification.close()}}catch{/* Some mobile browsers expose the API without supporting page notifications. */}
   }
  }
  const timer=setInterval(tick,1000)
  return()=>clearInterval(timer)
 },[username,settings,loaded,snapshot])
 return null
}
