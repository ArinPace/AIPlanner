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
  const {enabled,intensity,weekdays,overrides,recoveryUntil}=row.profile
  const patch={enabled,intensity,weekdays,overrides,recoveryUntil}
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
    <p className="quiet">Tell Main Chat about your sleep, meals, routines and preferences. Your agent remembers and adapts them to you.</p>
    <label className="planning-field">Default intensity: {profile.intensity} · {intensityDescription(profile.intensity)}<input aria-label="Default planning intensity" type="range" min="0" max="100" value={profile.intensity} onChange={e=>change({intensity:Number(e.target.value)})}/></label>
    <p className="quiet">Gentle: shorter work, more rest and transition time. Focused: longer work, tighter buffers. Breaks remain at every level.</p>
    <fieldset className="planning-weekdays"><legend>Weekly intensity</legend>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,i)=><label key={name}>{name}<input aria-label={name+' intensity'} type="number" min="0" max="100" placeholder={'Default '+profile.intensity} value={profile.weekdays[i]??''} onChange={e=>change({weekdays:profile.weekdays.map((v,index)=>index===i?(e.target.value===''?null:Math.max(0,Math.min(100,Number(e.target.value)))):v)})}/></label>)}</fieldset>
   </>}
   <fieldset className="planning-date"><legend>Specific day override</legend><input aria-label="Intensity date" type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/><label className="planning-field">Intensity: {profile.overrides[selectedDate]??'Use weekly default'}<input aria-label="Day planning intensity" type="range" min="0" max="100" value={profile.overrides[selectedDate]??profile.weekdays[new Date(selectedDate+'T12:00:00').getDay()]??profile.intensity} onChange={e=>change({overrides:{...profile.overrides,[selectedDate]:Number(e.target.value)}})}/></label><button type="button" className="text-btn" onClick={()=>{const next={...profile.overrides};delete next[selectedDate];change({overrides:next})}}>Use weekly default</button></fieldset>
   <label className="planning-field">Recovery mode through<input aria-label="Recovery through" type="date" value={profile.recoveryUntil||''} onChange={e=>change({recoveryUntil:e.target.value||null})}/></label>
   <p className="quiet">Recovery caps intensity at 20, including day overrides. Tell Main Chat you’re sick to apply this for the remaining week.</p>
   <button type="button" className="primary-btn" disabled={busy} onClick={()=>void save()}>{busy?'Saving and replanning…':'Save preferences'}</button>
  </>}
 </dialog>
}
export function PlanningButton({date}:{date:string}){
 const [open,setOpen]=useState(false)
 return <><button type="button" className="day-intensity-button" title={'Adjust intensity for '+date} aria-label={'Adjust intensity for '+date} onClick={e=>{e.stopPropagation();setOpen(true)}}>Intensity</button>{open&&<PlanningSettings date={date} onClose={()=>setOpen(false)}/>}</>
}
