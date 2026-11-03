import {isIPhoneApp, nativeRequest} from './platform'
import {widgetSnapshot} from './widgetSnapshot'
import type {StoredState} from '../types'

type Kind = 'calendar'|'files'
export type ReplicaPart = {account:string;kind:Kind;savedAt:number;data:Record<string,unknown>}
export const REPLICA_CHANGED='planner-local-copy-changed'
let account:string|null=null, generation=0, activated=false, queue:Promise<unknown>=Promise.resolve()
let failure='', widgetFailure=''
const nativePublished=new Map<Kind,string>()
const notify=()=>window.dispatchEvent(new Event(REPLICA_CHANGED))
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open('planner-local-copy',1)
 request.onupgradeneeded=()=>request.result.createObjectStore('parts',{keyPath:'kind'})
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
})}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await database()
 try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction('parts',mode),request=run(tx.objectStore('parts'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
function enqueue(run:()=>Promise<unknown>){queue=queue.catch(()=>{}).then(run);return queue}
export function replicaContext(){return {account,generation}}
export function activateReplica(next:string|null){
 if(activated&&next===account)return
 activated=true
 account=next;generation++;failure='';widgetFailure='';nativePublished.clear()
 const scope=generation
 void enqueue(async()=>{
  // Clear previous accounts, including a previous browser session's disk copy.
  try{const rows=await transaction('readonly',s=>s.getAll()) as ReplicaPart[];if(!next||rows.some(row=>row.account!==next))await transaction('readwrite',s=>s.clear())}catch(e){failure=String(e)}
  if(isIPhoneApp())try{await nativeRequest({action:'localReplicaAccount',account:next})}catch(e){failure=e instanceof Error?e.message:String(e);await nativeRequest({action:'clearWidgetSchedule'}).catch(()=>{})}
  if(scope===generation)notify()
 })
}
export async function saveReplica(kind:Kind,data:Record<string,unknown>,context=replicaContext()){
 if(!context.account||context.account!==account||context.generation!==generation)return
 const part:ReplicaPart={account:context.account,kind,data,savedAt:Date.now()}
 await enqueue(async()=>{
  if(context.account!==account||context.generation!==generation)return
  failure=''
  try{
   const previous=await transaction('readonly',s=>s.get(kind)) as ReplicaPart|undefined
   // An older in-flight GET must not replace an acknowledged newer revision.
   if(previous?.account===account&&typeof previous.data.revision==='number'&&typeof data.revision==='number'&&previous.data.revision>data.revision)return
   if(previous?.account!==account||typeof data.revision!=='number'||previous?.data.revision!==data.revision)await transaction('readwrite',s=>s.put(part))
  }catch(e){failure=e instanceof Error?e.message:String(e)}
  if(context.account!==account||context.generation!==generation)return
  if(isIPhoneApp()){
   const signature=typeof data.revision==='number'?String(data.revision):JSON.stringify(data)
   if(nativePublished.get(kind)!==signature)try{await nativeRequest({action:'localReplica',...part});nativePublished.set(kind,signature)}catch(e){failure=e instanceof Error?e.message:String(e)}
   if(kind==='calendar')try{await nativeRequest({action:'widgetSchedule',account:context.account,schedule:widgetSnapshot((data as unknown as StoredState).events, undefined, (data as unknown as StoredState).tags||[], (data as unknown as StoredState).resolvedWidgetFeedbackIds||[])});widgetFailure=''}catch(e){widgetFailure=e instanceof Error?e.message:String(e)}
  }
  notify()
 })
}
export function recordReplica(path:string,method:string,data:unknown,body:BodyInit|null|undefined,context:ReturnType<typeof replicaContext>){
 if(!data||typeof data!=='object')return
 let payload=data as Record<string,unknown>,kind:Kind|undefined
 if(path==='/api/calendar')kind='calendar'
 else if(path==='/api/files'||/^\/api\/files\/(trash|restore|purge|upload(?:\/finish)?)($|\?)/.test(path))kind='files'
 if(!kind)return
 if(method==='PUT'&&payload.ok===true&&typeof body==='string'){try{payload={...JSON.parse(body),revision:payload.revision}}catch{return}}
 if(kind==='calendar'&&!Array.isArray(payload.events)||kind==='files'&&(!Array.isArray(payload.files)||!Array.isArray(payload.folders)))return
 void saveReplica(kind,payload,context).catch(()=>{})
}
export async function readReplica(){
 await queue.catch(()=>{})
 const context=replicaContext()
 const parts=await transaction('readonly',s=>s.getAll()) as ReplicaPart[]
 if(context.generation!==generation)return {version:1,account:null,parts:[]}
 return {version:1,account,parts:parts.filter(p=>p.account===account)}
}
export async function replicaStatus(){
 const copy=await readReplica()
 return {...copy,error:failure,widgetError:widgetFailure}
}
