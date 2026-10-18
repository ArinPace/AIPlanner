import type {VmJob,VmState} from './vm.js'

export function vmJobStatus(job:VmJob,state:VmState|null,now:number):string {
  if(job.status==='waiting')return 'Queued message ? runs after earlier tasks'
  if(job.status==='paused')return 'Paused'
  const since=Date.parse(job.status==='running'?job.started_at||job.created_at:job.created_at)
  const seconds=Math.max(0,Math.floor((now-since)/1000))
  const elapsed=Number.isFinite(seconds)?seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`:''
  if(job.status==='running')return `Working${elapsed?' · '+elapsed:''}`
  const active=state?.queue?.active || state?.runs.find(run=>run.status==='running')
  if(active && active.id!==job.id)return `Queued behind ${active.kind==='sync'?'a source review':'another agent task'}${elapsed?' · waiting '+elapsed:''}`
  if(state?.power==='preparing')return 'Preparing your private computer…'
  if(state?.power==='online' || state?.hosts.some(host=>host.online))return `Waiting for your agent${elapsed?' · '+elapsed:''}…`
  return `Waking your private computer${elapsed?' · '+elapsed:''}…`
}
