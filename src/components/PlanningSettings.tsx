import {useEffect,useRef,useState} from 'react'
import {planningRequest} from '../lib/api'
import {intensityDescription,type PlanningProfile} from '../lib/planning'
import {PlannerDate as Date} from '../lib/timezone'
import {toDateInput} from '../lib/dates'

type Row={profile:PlanningProfile;revision:number;startedAt:string|null}
export function PlanningSettings({date,onClose}:{date?:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null)
 const [row,setRow]=useState<Row|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const [selectedDate,setSelectedDate]=useState(date||toDateInput(new Date()))
 useEffect(()=>{dialog.current?.showModal();let cancelled=false;void planningRequest<Row>().then(value=>{if(!cancelled)setRow(value)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[])
 const profile=row?.profile
 const change=(patch:Partial<PlanningProfile>)=>setRow(current=>current?{...current,profile:{...current.profile,...patch}}:current)
 async function save(){if(!row||busy)return;setBusy(true);setError('');setNotice('');try{
  const {tasks:_tasks,learning:_learning,feedback:_feedback,...patch}=row.profile
  const result=await planningRequest<Row & {replanError?:string|null;plan?:{warnings:string[]}}>({revision:row.revision,patch})
  setRow(result);setNotice(result.replanError?'Preferences saved; replanning needs attention.':result.plan?'Saved and remaining week replanned.'+(result.plan.warnings.length?' Some tasks did not fit; review them in Main Chat.':''):'Saved. Continue setup in Main Chat, then press Start planning my calendar when you are ready.');if(result.replanError)setError(result.replanError);window.dispatchEvent(new Event('planner-calendar-refresh'))
 }catch(e){setError(e instanceof Error?e.message:'Could not save preferences.')}finally{setBusy(false)}}
 return <dialog ref={dialog} className="files-dialog planning-dialog" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <div className="files-dialog-head"><h2>{date?'Day intensity':'Planning & intensity'}</h2><button type="button" className="icon-btn" aria-label="Close planning settings" disabled={busy} onClick={onClose}>×</button></div>
  {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!profile?<p>Loading planning preferences…</p>:<>
   {!date&&<>
    <label className="planning-toggle"><input type="checkbox" disabled={!row?.startedAt} checked={profile.enabled} onChange={e=>change({enabled:e.target.checked})}/>Automatically plan and rearrange flexible blocks</label>
    <p className="quiet">Existing appointments stay fixed. Calendar generation begins only after you press Start planning my calendar in Main Chat. After that, changes replan future unlocked agent blocks.</p>
    <label className="planning-field">Default intensity: {profile.intensity} · {intensityDescription(profile.intensity)}<input aria-label="Default planning intensity" type="range" min="0" max="100" value={profile.intensity} onChange={e=>change({intensity:Number(e.target.value)})}/></label>
    <p className="quiet">Gentle: shorter work, more rest and transition time. Focused: longer work, tighter buffers. Breaks remain at every level.</p>
    <fieldset className="planning-weekdays"><legend>Weekly intensity</legend>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,i)=><label key={name}>{name}<input aria-label={name+' intensity'} type="number" min="0" max="100" placeholder={'Default '+profile.intensity} value={profile.weekdays[i]??''} onChange={e=>change({weekdays:profile.weekdays.map((v,index)=>index===i?(e.target.value===''?null:Math.max(0,Math.min(100,Number(e.target.value)))):v)})}/></label>)}</fieldset>
    <div className="planning-hours"><label>Wake<input type="time" value={profile.wake} onChange={e=>change({wake:e.target.value})}/></label><label>Sleep<input type="time" value={profile.sleep} onChange={e=>change({sleep:e.target.value})}/></label></div>
    <div className="planning-hours"><label>Getting ready (minutes)<input aria-label="Getting ready minutes" type="number" min="0" max="180" value={profile.readyMinutes} onChange={e=>change({readyMinutes:Number(e.target.value)})}/></label><label>Wind down (minutes)<input aria-label="Wind down minutes" type="number" min="0" max="180" value={profile.windDownMinutes} onChange={e=>change({windDownMinutes:Number(e.target.value)})}/></label></div>
    <fieldset className="planning-weekdays"><legend>Meal routine</legend>{profile.meals.map((meal,i)=><div className="planning-meal" key={i}><label>{meal.title}<input aria-label={meal.title+' time'} type="time" value={meal.time} onChange={e=>change({meals:profile.meals.map((v,index)=>index===i?{...v,time:e.target.value}:v)})}/></label><label>Minutes<input aria-label={meal.title+' minutes'} type="number" min="5" max="180" value={meal.minutes} onChange={e=>change({meals:profile.meals.map((v,index)=>index===i?{...v,minutes:Number(e.target.value)}:v)})}/></label></div>)}</fieldset>
    <label className="planning-field">Goals<textarea rows={3} value={profile.goals} onChange={e=>change({goals:e.target.value})}/></label>
    <label className="planning-field">Routine and preferences<textarea rows={3} placeholder="Laundry days, meal times, task variety, things that help you recover…" value={profile.preferences} onChange={e=>change({preferences:e.target.value})}/></label>
    <label className="planning-field">Break activities (one per line)<textarea rows={4} value={profile.breakActivities.join('\n')} onChange={e=>change({breakActivities:e.target.value.split('\n')})}/></label>
    <label className="planning-toggle"><input type="checkbox" checked={profile.onboarded} onChange={e=>change({onboarded:e.target.checked})}/>I have confirmed my routine and task estimates with the agent</label>
   </>}
   <fieldset className="planning-date"><legend>Specific day override</legend><input aria-label="Intensity date" type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/><label className="planning-field">Intensity: {profile.overrides[selectedDate]??'Use weekly default'}<input aria-label="Day planning intensity" type="range" min="0" max="100" value={profile.overrides[selectedDate]??profile.weekdays[new Date(selectedDate+'T12:00:00').getDay()]??profile.intensity} onChange={e=>change({overrides:{...profile.overrides,[selectedDate]:Number(e.target.value)}})}/></label><button type="button" className="text-btn" onClick={()=>{const next={...profile.overrides};delete next[selectedDate];change({overrides:next})}}>Use weekly default</button></fieldset>
   <label className="planning-field">Recovery mode through<input aria-label="Recovery through" type="date" value={profile.recoveryUntil||''} onChange={e=>change({recoveryUntil:e.target.value||null})}/></label>
   <p className="quiet">Recovery caps intensity at 20, including day overrides. Tell Main Chat you’re sick to apply this for the remaining week.</p>
   <button type="button" className="primary-btn" disabled={busy||profile.breakActivities.some(a=>!a.trim())} onClick={()=>void save()}>{busy?'Saving and replanning…':'Save preferences'}</button>
  </>}
 </dialog>
}
export function PlanningButton({date}:{date:string}){
 const [open,setOpen]=useState(false)
 return <><button type="button" className="day-intensity-button" title={'Adjust intensity for '+date} aria-label={'Adjust intensity for '+date} onClick={e=>{e.stopPropagation();setOpen(true)}}>Intensity</button>{open&&<PlanningSettings date={date} onClose={()=>setOpen(false)}/>}</>
}
