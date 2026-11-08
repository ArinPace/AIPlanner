type Resource<T>={value:T;bytes:number;dispose:()=>void|Promise<void>}
type Entry<T>={promise:Promise<Resource<T>>;resource?:Resource<T>;users:number;usedAt:number}

// Warm-instance optimization only. Authorization must run before every use.
export class ResourceCache<T>{
 private entries=new Map<string,Entry<T>>()
 private maxBytes:number
 private maxEntries:number
 private ttl:number
 private now:()=>number
 constructor(maxBytes=64*1024*1024,maxEntries=3,ttl=300000,now=Date.now){this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.ttl=ttl;this.now=now}
 private async prune(){
  let bytes=[...this.entries.values()].reduce((n,e)=>n+(e.resource?.bytes||0),0)
  for(const [key,entry] of [...this.entries].sort((a,b)=>a[1].usedAt-b[1].usedAt)){
   if(this.entries.get(key)!==entry)continue
   if(entry.users||!entry.resource)continue
   if(this.now()-entry.usedAt<this.ttl&&bytes<=this.maxBytes&&this.entries.size<=this.maxEntries)continue
   this.entries.delete(key);bytes-=entry.resource.bytes
   try{await entry.resource.dispose()}catch{/* A failed cleanup must not break the next authorized read. */}
  }
 }
 async use<R>(key:string,load:()=>Promise<Resource<T>>,read:(value:T)=>Promise<R>):Promise<R>{
  await this.prune()
  let entry=this.entries.get(key)
  if(!entry){
   const added:Entry<T>={promise:Promise.resolve().then(load),users:0,usedAt:this.now()}
   entry=added;this.entries.set(key,added)
   added.promise=added.promise.then(resource=>{added.resource=resource;return resource})
  }
  entry.users++;entry.usedAt=this.now()
  try{return await read((await entry.promise).value)}
  catch(error){if(!entry.resource&&this.entries.get(key)===entry)this.entries.delete(key);throw error}
  finally{entry.users--;entry.usedAt=this.now();await this.prune()}
 }
}
