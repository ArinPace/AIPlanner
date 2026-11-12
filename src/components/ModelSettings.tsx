import {useEffect,useState} from 'react'
import {agentAction} from '../lib/agent'
import {nativeRequest} from '../lib/platform'
import type {VmState} from '../lib/vm'
import type {GenerationOptions} from '../../worker/model-options.mjs'

export function AgentModelSettings({state,refresh}:{state:VmState;refresh:()=>Promise<void>}){
 const [value,setValue]=useState<GenerationOptions>(state.settings.generation_options||{}),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const models=state.hosts[0]?.capabilities.modelCatalog||[],model=models.find(m=>m.model===value.model)
 return <section className="assistant-settings-section"><h3>Model, speed & thinking</h3><p>Applies to new messages and scheduled Agent runs. Current runs finish with their existing settings.</p>
 <label>Model<select aria-label="Agent model" disabled={busy||!models.length} value={value.model||''} onChange={e=>setValue(e.target.value?{model:e.target.value}:{})}><option value="">Provider default</option>{models.map(m=><option key={m.model} value={m.model}>{m.label}</option>)}</select></label>
 <label>Thinking<select aria-label="Agent thinking" disabled={busy||!model} value={value.effort||''} onChange={e=>setValue({...value,effort:e.target.value||undefined})}><option value="">Model default</option>{model?.efforts.map(e=><option key={e} value={e}>{e}</option>)}</select></label>
 <label>Speed<select aria-label="Agent speed" disabled={busy||!model} value={value.serviceTier||''} onChange={e=>setValue({...value,serviceTier:e.target.value||undefined})}><option value="">Standard</option>{model?.tiers.filter(t=>t.id!=='default').map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
 {!models.length&&<p role="status">Available options will appear when the connected Codex worker reports its model catalog. Claude controls are not offered by this connection.</p>}
 <p className="quiet">Faster speeds and higher thinking levels may use more of your provider allowance.</p>
 <button type="button" disabled={busy} onClick={async()=>{setBusy(true);setNotice('');try{await agentAction('vm/model-options',{options:value});await refresh();setNotice('Saved for the next run.')}catch(e){setNotice(e instanceof Error?e.message:'Could not save model settings.')}finally{setBusy(false)}}}>Save model settings</button>{notice&&<p role="status">{notice}</p>}
 </section>
}
type ModelMenu={sliders?:{id:string;label:string;min:number;max:number;value:number;text:string}[];summary:string;options:{id:string;label:string;selected:boolean;submenu:boolean}[]}
export function ChatModelSettings({username,disabled,providerURL}:{username:string;disabled:boolean;providerURL?:string|null}){
 const [menu,setMenu]=useState<ModelMenu|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function act(operation:'open'|'choose'|'close'|'adjust',id?:string,value?:number){setBusy(true);setError('');try{const result=await nativeRequest<ModelMenu>({action:'chatGPTRelayModel',account:username,operation,id,value,url:providerURL,newChat:!providerURL});setMenu(operation==='close'?null:result)}catch(e){setError(e instanceof Error?e.message:'Could not open model settings.')}finally{setBusy(false)}}
 useEffect(()=>()=>{if((window.plannerNativeChatGPTRelayVersion||0)>=7)void nativeRequest({action:'chatGPTRelayModel',account:username,operation:'close'}).catch(()=>{})},[username])
 const supported=(window.plannerNativeChatGPTRelayVersion||0)>=7
 return <section className="assistant-settings-section"><h3>Model, speed & thinking</h3><p>Choose from the controls offered by your ChatGPT account for the currently loaded conversation. Availability depends on your plan and model.</p>
 {!supported?<p>Update the iPhone app to access ChatGPT’s model controls from Planner.</p>:<><button type="button" disabled={disabled||busy} onClick={()=>void act('open')}>{menu?'Refresh available options':'Choose model and thinking'}</button>{menu&&<><p role="status">{menu.summary}</p>{menu.sliders?.map(s=><label key={s.id}>{s.label}: {s.text||`${s.value-s.min+1} of ${s.max-s.min+1}`}<input type="range" aria-label={s.label} min={s.min} max={s.max} step={1} value={s.value} disabled={busy||disabled} onChange={e=>{const value=Number(e.target.value);setMenu(current=>current?{...current,sliders:current.sliders?.map(range=>range.id===s.id?{...range,value}:range)}:current)}}/><button type="button" disabled={busy||disabled} onClick={()=>void act('adjust',s.id,s.value)}>Apply thinking</button></label>)}<div className="assistant-model-options">{menu.options.map(o=><button key={o.id} type="button" aria-pressed={o.selected} disabled={disabled||busy} onClick={()=>void act('choose',o.id)}>{o.selected?'✓ ':''}{/^Enable (fast|standard) mode$/i.test(o.label)?`Fast mode — ${o.selected?'On':'Off'}`:o.label}{o.submenu?' ›':''}</button>)}</div><button type="button" disabled={busy} onClick={()=>void act('close')}>Close model menu</button></>}</>}{error&&<p role="alert">{error}</p>}
 </section>
}
