import {replicaContext} from '../lib/localReplica'
import {useEffect,useState} from 'react'
import {taskNotificationsRequest} from '../lib/api'
import {DEFAULT_TASK_NOTIFICATIONS,type TaskNotificationSettings as Preferences} from '../lib/taskNotifications'
import {isIPhoneApp,nativeRequest} from '../lib/platform'
export const TASK_NOTIFICATIONS_CHANGED='planner-task-notifications-changed'
export function TaskNotificationSettings(){
 const [settings,setSettings]=useState<Preferences>(DEFAULT_TASK_NOTIFICATIONS),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const [minutes,setMinutes]=useState('5')
 useEffect(()=>{let active=true;void taskNotificationsRequest().then(value=>{if(active){setSettings(value);setMinutes(value.minutes.join(', '))}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[])
 async function save(){
  setError('');setMessage('')
  const context=replicaContext()
  const ensureAccount=()=>{if(context.generation!==replicaContext().generation)throw new Error('Your account changed. Reopen notification settings.')}
  const offsets=minutes.split(',').map(n=>Number(n.trim()))
  if(!offsets.length||offsets.length>10||offsets.some(n=>!Number.isInteger(n)||n<1||n>1440)){setError('Enter up to 10 whole minutes from 1 to 1440, separated by commas.');return}
  if(!Number.isInteger(settings.longTaskMinutes)||settings.longTaskMinutes<1||settings.longTaskMinutes>1440){setError('Choose a long-task minimum from 1 to 1440 minutes.');return}
  setBusy(true)
  try{
   let permission=''
   if(settings.enabled){
    if(isIPhoneApp()){const result=await nativeRequest<{authorization:string}>({action:'taskNotificationPermission'});permission=result.authorization}
    else if('Notification' in window)permission=await Notification.requestPermission()
    else throw new Error('Notifications are not supported here. Use the updated iPhone app.')
   }
   ensureAccount()
   const saved=await taskNotificationsRequest({...settings,minutes:offsets})
   ensureAccount()
   setSettings(saved);setMinutes(saved.minutes.join(', '));window.dispatchEvent(new CustomEvent(TASK_NOTIFICATIONS_CHANGED,{detail:saved}))
   setMessage(saved.enabled&& !['authorized','provisional','ephemeral','granted'].includes(permission)?'Saved. Allow Planner notifications in your device’s notification settings to receive alerts.':'Notification settings saved.')
  }catch(e){setError(e instanceof Error?e.message:'Could not save notifications.')}finally{setBusy(false)}
 }
 return <section className="task-notification-settings" aria-label="Task notifications"><h3>Task notifications</h3>
 <fieldset disabled={loading||busy}><label><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> Enable notifications</label>
 <label><input type="checkbox" checked={settings.switches} onChange={e=>setSettings({...settings,switches:e.target.checked})}/> When a task ends or it is time to switch</label>
 <label><input type="checkbox" checked={settings.advance} onChange={e=>setSettings({...settings,advance:e.target.checked})}/> Reminders before longer tasks end</label>
 <label>Long task minimum (minutes)<input type="number" min="1" max="1440" value={settings.longTaskMinutes} onChange={e=>setSettings({...settings,longTaskMinutes:Number(e.target.value)})}/></label>
 <label>Minutes before the end<input type="text" inputMode="text" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="30, 10, 5"/></label>
 <p className="quiet">Separate reminders with commas, for example 30, 10, 5. Reminders that would fall before the task starts are skipped. Free time gets switch alerts, without advance reminders.</p>
 <button type="button" onClick={()=>void save()}>{busy?'Saving…':'Save notifications'}</button></fieldset>
 <p className="quiet">{isIPhoneApp()?'iPhone alerts work with Planner closed, using the last synced plan. Opening Planner refreshes upcoming alerts.':'Browser alerts require Planner to stay open. Use the iPhone app for alerts while it is closed.'}</p>
 {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="form-error">{error}</p>}</section>
}
