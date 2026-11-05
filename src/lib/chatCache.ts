// Account-scoped display cache only. Never store credentials or authorization state.
const memory=new Map<string,{token:string|null;value:unknown}>()
let generation=0,queue:Promise<unknown>=Promise.resolve()
const token=()=>localStorage.getItem('ai-planner-token')
const key=(username:string,kind:string)=>username+':'+kind
async function store<T>(mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const database=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('planner-chat-display',1);r.onupgradeneeded=()=>r.result.createObjectStore('items',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
 try{return await new Promise((resolve,reject)=>{const tx=database.transaction('items',mode),r=run(tx.objectStore('items'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{database.close()}
}
export function peekChatCache<T>(username:string,kind:string):T|null{const row=memory.get(key(username,kind));return row?.token===token()?row.value as T:null}
export async function readChatCache<T>(username:string,kind:string):Promise<T|null>{
 const scope=generation,auth=token(),cached=peekChatCache<T>(username,kind);if(!auth)return null;if(cached)return cached
 await queue.catch(()=>{})
 try{const row=await store('readonly',s=>s.get(key(username,kind)));if(scope!==generation||auth!==token()||row?.username!==username)return null;memory.set(key(username,kind),{token:auth,value:row.value});return row.value as T}catch{return null}
}
export function writeChatCache(username:string,kind:string,value:unknown){
 if(new TextEncoder().encode(JSON.stringify(value)).length>1024*1024)return
 const scope=generation,auth=token();if(!auth)return
 memory.set(key(username,kind),{token:auth,value})
 queue=queue.catch(()=>{}).then(async()=>{if(scope!==generation||auth!==token())return;try{await store('readwrite',s=>s.put({key:key(username,kind),username,value,savedAt:Date.now()}))}catch{/* Cached chat never blocks live chat. */}})
}
export function clearChatCache(){generation++;memory.clear();queue=queue.catch(()=>{}).then(()=>store('readwrite',s=>s.clear())).catch(()=>{})}
