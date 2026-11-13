import {unzip,strFromU8} from 'fflate'
import type {RelayFile} from './relayFiles'
const manifestPath='planner-relay-manifest.json'
const extract=(bytes:Uint8Array,filter:(file:{name:string;originalSize:number})=>boolean)=>new Promise<Record<string,Uint8Array>>((resolve,reject)=>unzip(bytes,{filter},(error,result)=>error?reject(error):resolve(result)))
export async function unpackRelayBundle(file:Omit<RelayFile,'id'>,turnId:string):Promise<(RelayFile&{transferKey:string})[]|null>{
 if(!/\.zip$/i.test(file.name)&&!file.mime.includes('zip'))return null
 const bytes=Uint8Array.from(atob(file.data.slice(file.data.indexOf(',')+1)),c=>c.charCodeAt(0))
 let raw:Record<string,Uint8Array>;try{raw=await extract(bytes,f=>f.name===manifestPath&&f.originalSize<=65536)}catch{return null}
 if(!raw[manifestPath])return null
 let manifest:any;try{manifest=JSON.parse(strFromU8(raw[manifestPath]))}catch{return null}
 if(!manifest||typeof manifest!=='object'||manifest.format!=='planner-relay-files/v1')return null
 if(manifest.turn!==turnId)throw Error('The returned file bundle belongs to another response. No files were imported.')
 if(!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>20)throw Error('Invalid attachment bundle.')
 const paths=new Set<string>();let total=0
 for(const item of manifest.files){
  if(typeof item.path!=='string'||item.path.length>500||!/^files\/[^/\\\u0000-\u001f]+$/.test(item.path)||['.','..'].includes(item.path.slice(6))||paths.has(item.path)||typeof item.name!=='string'||!item.name.trim()||item.name.length>240||/[\u0000-\u001f/\\]/.test(item.name)||typeof item.mime!=='string'||item.mime.length>150||/[\r\n]/.test(item.mime)||!Number.isInteger(item.size)||item.size<1||item.size>25*1024*1024||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid attachment bundle metadata.')
  paths.add(item.path);total+=item.size
 }
 if(total>50*1024*1024)throw Error('The attachment bundle exceeds 50 MB.')
 const expected=new Map<string,number>(manifest.files.map((item:any)=>[item.path,item.size]))
 const unpacked=await extract(bytes,f=>expected.has(f.name)&&expected.get(f.name)===f.originalSize)
 const result:(RelayFile&{transferKey:string})[]=[]
 for(const item of manifest.files){
  const data=unpacked[item.path];if(!data||data.length!==item.size)throw Error('An attachment is missing or incomplete.')
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.slice().buffer)),b=>b.toString(16).padStart(2,'0')).join('')
  if(digest!==item.sha256)throw Error('An attachment checksum did not match. No success was reported.')
  let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768))
  result.push({id:crypto.randomUUID(),name:item.name,mime:item.mime||'application/octet-stream',size:data.length,data:'data:'+item.mime+';base64,'+btoa(binary),transferKey:item.path+':'+digest})
 }
 return result
}
