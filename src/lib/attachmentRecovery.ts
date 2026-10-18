import type {ChatAttachment} from './chatAttachments'
export type AttachmentRecovery={chatId:string|null;message:string;attachments:ChatAttachment[];files:File[];savedAt:number}
export const RECOVERY_TAB='ai-planner-attachment-recovery-tab'
export function outdatedAttachmentModule(error:unknown){
 return error instanceof Error && /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|setting up fake worker failed|cannot load script at/i.test(error.message)
}
async function database(){
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('ai-planner-attachment-recovery',1)
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts')
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(request.error)
 })
}
export async function saveAttachmentRecovery(username:string,value:AttachmentRecovery){
 const db=await database()
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,username);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
export async function takeAttachmentRecovery(username:string){
 const db=await database()
 try{return await new Promise<AttachmentRecovery|null>((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),request=store.get(username)
  let value:AttachmentRecovery|null=null
  request.onsuccess=()=>{const saved=request.result as AttachmentRecovery|undefined;if(saved&&Date.now()-saved.savedAt<3600000)value=saved;store.delete(username)}
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
 })}finally{db.close()}
}
