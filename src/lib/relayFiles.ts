import {subscriptionChatRequest} from './api'
export type RelayFile={id:string;name:string;mime:string;size:number;data:string;cloudId?:string}
export const RELAY_FILE_MAX=25*1024*1024
export const RELAY_BATCH_MAX=50*1024*1024
export async function prepareRelayFile(file:File):Promise<RelayFile>{
 if(file.name.length>240)throw Error('Rename the file to 240 characters or fewer.')
 if(file.type.startsWith('image/')&&file.size>20*1024*1024)throw Error('ChatGPT accepts images up to 20 MB. Choose a smaller image.')
 if(!file.size||file.size>RELAY_FILE_MAX)throw Error('Each file must be between 1 byte and 25 MB.')
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read '+file.name));reader.readAsDataURL(file)})
 return {id:crypto.randomUUID(),name:file.name,mime:file.type||'application/octet-stream',size:file.size,data}
}
export async function storeRelayFile(chatId:string,file:RelayFile){
 if(file.cloudId)return file.cloudId
 const start=await subscriptionChatRequest<{id:string;url:string}>(undefined,{action:'file_start',chatId,name:file.name,mime:file.mime,size:file.size})
 const bytes=await (await fetch(file.data)).blob()
 const uploaded=await fetch(start.url,{method:'PUT',headers:{'Content-Type':file.mime},body:bytes})
 if(!uploaded.ok)throw Error('Could not upload '+file.name+'. Your file is still selected.')
 await subscriptionChatRequest(undefined,{action:'file_finish',id:start.id});file.cloudId=start.id;return start.id
}
export function relayFileLink(name:string,id:string){return '['+name.replace(/[\\\[\]\r\n]/g,'_')+'](#planner-chat-file/'+id+')'}
export async function downloadRelayFile(id:string){
 const result=await subscriptionChatRequest<{url:string;name:string}>(undefined,{action:'file_download',id})
 const response=await fetch(result.url);if(!response.ok)throw Error('File download failed.')
 const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=result.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
