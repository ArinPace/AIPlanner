import type {SourceAlert} from './sourceAlerts'
import type {TaskNotificationSettings} from './taskNotifications'
import {activateReplica,recordReplica,replicaContext,saveReplica} from './localReplica'
import {isIPhoneApp,nativeRequest} from './platform'
import type { StoredState } from '../types'
import { DEFAULT_TAGS } from './storage'
import {validateFilesState,type FilesState} from './files'
import {applyFilesPatch,filesPatches,type FilesManifest,type WorkspaceItem} from './filesTransfer'

const TOKEN_KEY = 'ai-planner-token'
export function fixedCalendarSync<T>(run=false){return request<T>('/api/calendar/google-sync',run?{method:'POST',body:'{}'}:{})}
export function planningRequest<T>(input?:unknown):Promise<T>{return request<T>('/api/planning',input===undefined?{}:{method:'POST',body:JSON.stringify(input)})}
export function noteHistoryRequest<T>(noteId:string,options:{before?:number;versionId?:number;offset?:number}={}):Promise<T>{return request<T>('/api/files/history?'+new URLSearchParams({noteId,...Object.fromEntries(Object.entries(options).map(([key,value])=>[key,String(value)]))}))}
export function calendarHistoryRequest<T>(options:{before?:number;versionId?:number}={}):Promise<T>{return request<T>('/api/calendar/history?'+new URLSearchParams(Object.fromEntries(Object.entries(options).map(([key,value])=>[key,String(value)]))))}
export function restoreCalendarVersion(input:{versionId:number;revision:number;side:'before'|'after';overwrite:boolean}){return request('/api/calendar/restore',{method:'POST',body:JSON.stringify(input)})}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if(token!==getToken()){calendarRevision=undefined;clearFilesCache()}
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else {localStorage.removeItem(TOKEN_KEY);activateReplica(null)}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const context=replicaContext()
  let response: Response
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  if(token!==getToken())throw new Error('Your account changed. Reload your current plan.')
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  if(['/api/session','/api/login','/api/register','/api/auth/google/finish','/api/auth/google/link','/api/auth/google/create'].includes(path)){
    const identity=(data as unknown as {username?:unknown})?.username
    if(typeof identity==='string'||identity===null)activateReplica(identity)
  }
  recordReplica(path,options.method||'GET',data,options.body,context)
  return data
}

export function login(username: string, password: string) {
  return request<{ token: string; username: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function register(username: string, password: string, email?: string) {
  return request<{ token: string; username: string }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, email }),
  })
}

export async function logout() {
  try{return await request<{ ok: boolean }>('/api/logout', { method: 'POST' })}finally{activateReplica(null)}
}

export function getSession() {
  return request<{ username: string | null }>('/api/session')
}

let calendarRevision: number | undefined
export function adoptCalendarRevision(revision: number | undefined) { calendarRevision = revision }
export async function loadCalendar({ adopt = true }: { adopt?: boolean } = {}) {
  const state = await request<StoredState>('/api/calendar')
  if (adopt) adoptCalendarRevision(state.revision)
  return state
}

export async function saveCalendar(state: StoredState) {
  const saved = await request<{ ok: boolean; revision?: number }>('/api/calendar', {
    method: 'PUT',
    body: JSON.stringify({ ...state, revision: calendarRevision }),
  })
  calendarRevision = saved.revision
  return saved
}

export function emptyCalendar(): StoredState {
  return { events: [], tags: DEFAULT_TAGS, hiddenTagIds: [], zoom: 1 }
}

let filesCacheToken:string|null=null,filesBase:FilesState|null=null
let filesLoading:{token:string|null;promise:Promise<FilesState>}|null=null
const filesItems=new Map<string,{etag:string;item:WorkspaceItem}>()
function clearFilesCache(){filesBase=null;filesItems.clear();filesLoading=null;filesCacheToken=getToken()}
async function loadFilesParts():Promise<FilesState>{
 const token=getToken(),context=replicaContext()
 if(filesCacheToken!==token)clearFilesCache()
 const response=await request<FilesManifest|FilesState>('/api/files?manifest=1')
 // Older local servers and isolated test fixtures still return a complete state.
 if(!('format' in response)||response.format!=='files-manifest'){
  const state=response as FilesState;validateFilesState(state);filesBase=state
  void saveReplica('files',state as unknown as Record<string,unknown>,context);return state
 }
 const manifest=response as FilesManifest
 if(filesBase?.revision===manifest.revision)return filesBase
 const state:FilesState={revision:manifest.revision,storageLimitBytes:manifest.storageLimitBytes,files:[],folders:[],documents:[]}
 const values:WorkspaceItem[]=new Array(manifest.items.length)
 let cursor=0
 async function consume(){
  while(cursor<manifest.items.length){
   const position=cursor++,entry=manifest.items[position],key=entry.section+':'+entry.id,cached=filesItems.get(key)
   const item=entry.value??(cached&&cached.etag===entry.etag?cached.item:undefined)??(await request<{item:WorkspaceItem}>('/api/files/item?'+new URLSearchParams({section:entry.section,id:entry.id,index:String(entry.index),revision:String(manifest.revision)}))).item
   if(item.id!==entry.id)throw new Error('Files changed while loading. Please retry.')
   values[position]=item;filesItems.set(key,{etag:entry.etag,item})
  }
 }
 await Promise.all(Array.from({length:4},consume))
 for(let i=0;i<values.length;i++)(state[manifest.items[i].section] as WorkspaceItem[]).push(values[i])
 if(token!==getToken())throw new Error('Your account changed. Reload your current files.')
 validateFilesState(state,state.storageLimitBytes)
 if(filesBase?.revision!==undefined&&filesBase.revision>manifest.revision)return filesBase
 filesBase=state
 const keep=new Set(manifest.items.map(item=>item.section+':'+item.id));for(const key of filesItems.keys())if(!keep.has(key))filesItems.delete(key)
 void saveReplica('files',state as unknown as Record<string,unknown>,context)
 return state
}
export function loadFiles():Promise<FilesState>{
 const token=getToken()
 if(filesLoading?.token===token)return filesLoading.promise
 const promise=loadFilesParts().catch(error=>{if(error instanceof Error&&error.message.startsWith('Files changed while loading'))return loadFilesParts();throw error}).finally(()=>{if(filesLoading?.promise===promise)filesLoading=null})
 filesLoading={token,promise};return promise
}
export async function saveFiles(state:FilesState){
 const context=replicaContext(),token=getToken()
 const previous=filesBase??await loadFiles()
 if(previous.revision!==state.revision)throw new Error('Files changed. Reload the latest version before saving.')
 validateFilesState(state,state.storageLimitBytes)
 let current=previous,saved:{ok:boolean;revision?:number;planningSyncError?:string}={ok:true,revision:previous.revision}
 for(const patch of filesPatches(previous,state)){
  patch.revision=current.revision
  saved=await request('/api/files',{method:'PATCH',body:JSON.stringify(patch)})
  current={...applyFilesPatch(current,patch),revision:saved.revision??current.revision}
  if(token!==getToken())throw new Error('Your account changed. Reload your current files.')
  filesBase=current
  void saveReplica('files',current as unknown as Record<string,unknown>,context)
 }
 window.dispatchEvent(new Event('planner-calendar-refresh'))
 return saved
}
export interface FileBinEntry {id:string;names:string[];item_count:number;deleted_at:string;expires_at:string}
export function loadFileBin(){return request<{items:FileBinEntry[]}>('/api/files/bin')}
export async function fileBinAction(action:'trash'|'restore'|'purge',ids:string[],revision:number){await request('/api/files/'+action+'?summary=1',{method:'POST',body:JSON.stringify({ids,revision})});filesLoading=null;return loadFiles()}

export async function uploadPdf(folderId: string | null, file: File) {
  if (!(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('Choose a valid PDF file.')
  const ticket = await request<{ mode: 'local' | 'signed'; id?: string; uploadUrl?: string }>('/api/files/upload/start', {
    method: 'POST', body: JSON.stringify({ folderId, name: file.name, size: file.size }),
  })
  if (ticket.mode === 'local') {
    await request(`/api/files/upload?summary=1&folderId=${encodeURIComponent(folderId ?? '')}`, {
      method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) },
    })
    filesLoading=null;return loadFiles()
  }
  try {
    const upload = await fetch(ticket.uploadUrl!, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file })
    if (!upload.ok) throw new Error('Could not upload the PDF. Please try again.')
    await request('/api/files/upload/finish?summary=1', { method: 'POST', body: JSON.stringify({ id: ticket.id }) });filesLoading=null;return loadFiles()
  } catch (error) {
    await request('/api/files/upload/cancel', { method: 'POST', body: JSON.stringify({ id: ticket.id }) }).catch(() => undefined)
    throw error
  }
}

export async function downloadPdf(id: string, name: string) {
  const token = getToken()
  const response = await fetch(`/api/files/documents/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!response.ok) throw new Error('Could not download this PDF. Please try again.')
  const blob = response.headers.get('Content-Type')?.includes('application/json')
    ? await fetch((await response.json() as { downloadUrl: string }).downloadUrl).then((download) => { if (!download.ok) throw new Error('Could not download PDF.'); return download.blob() })
    : await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = /\.pdf$/i.test(name) ? name : `${name}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}


export type GoogleLoginResult={username:string;token:string;pending?:false}|{pending:true;email:string;existingAccount:boolean}
export function authOptions(){return request<{googleEnabled:boolean;pendingGoogle:boolean}>('/api/auth/options')}
export function startGoogleLogin(){return request<{url:string}>('/api/auth/google/start',{method:'POST',body:'{}'})}
let googleFinish:Promise<GoogleLoginResult>|undefined
export function finishGoogleLogin(){return googleFinish??=request<GoogleLoginResult>('/api/auth/google/finish',{method:'POST',body:'{}'}).finally(()=>{setTimeout(()=>{googleFinish=undefined},1000)})}
export function linkGoogleLogin(identifier:string,password:string){return request<GoogleLoginResult>('/api/auth/google/link',{method:'POST',body:JSON.stringify({identifier,password})})}
export function createGoogleLogin(){return request<GoogleLoginResult>('/api/auth/google/create',{method:'POST',body:'{}'})}


export async function downloadCalendarJson(staging=false){
 const data=await request<unknown>(staging?'/api/calendar/staging.json':'/api/calendar/export.json')
 if(isIPhoneApp()){await nativeRequest({action:'downloadText',name:staging?'calendar-staging.json':'calendar.json',text:JSON.stringify(data,null,2)});return}
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
 const a=document.createElement('a');a.href=url;a.download=staging?'calendar-staging.json':'calendar.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function taskNotificationsRequest(settings?:TaskNotificationSettings){return request<TaskNotificationSettings>('/api/notifications',settings?{method:'PUT',body:JSON.stringify(settings)}:{})}

export function sourceStatusRequest(){return request<{issues:SourceAlert[];checkedAt:string}>('/api/sources/status')}

export function subscriptionChatRequest<T=import('./subscriptionChat').SubscriptionWorkspace>(chat?:string,action?:Record<string,unknown>,before?:string){
 const query=new URLSearchParams();if(chat)query.set('chat',chat);if(before)query.set('before',before)
 return request<T>('/api/subscription-chat'+(query.size?'?'+query:''),action?{method:'POST',body:JSON.stringify(action)}:{})
}
