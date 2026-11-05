import {useEffect,useState} from 'react'
import {agentRequest} from '../lib/agent'
type Turnover={nextAt:string|null;basis:string;sources:string[];needsNextDate:boolean}
export function SubjectRolloverStatus(){
 const [value,setValue]=useState<Turnover|null>(null),[error,setError]=useState('')
 useEffect(()=>{let stopped=false;const read=async()=>{try{const result=await agentRequest<Turnover>('subject-rollover');if(!stopped){setValue(result);setError('')}}catch(e){if(!stopped)setError(e instanceof Error?e.message:'Subject turnover could not be read.')}};void read();const timer=setInterval(()=>void read(),15000);return()=>{stopped=true;clearInterval(timer)}},[])
 return <section className="assistant-settings-section" aria-label="Automatic subject turnover"><h3>Subject turnover</h3>{error?<p role="alert">{error}</p>:!value?<p>Loading next date…</p>:<><p>{value.needsNextDate?'Turnover in progress; the agent will book its follow-up.':value.nextAt?'Next check: '+new Date(value.nextAt).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' New York time':'Not scheduled yet. Ask the agent to research and book the next subject change.'}</p>{value.basis&&<p>{value.basis}</p>}<p>The agent archives finished subjects and their Tutor chats, sets up new subjects, and books the following check.</p>{value.sources.map((url,index)=><p key={url}><a href={url} target="_blank" rel="noreferrer">Date source {index+1}</a></p>)}</>}</section>
}
