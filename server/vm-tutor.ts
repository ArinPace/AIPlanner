import {db} from './cloud.js'
import {storage} from './mcp-auth.js'
import type {PlannerFolder} from '../src/lib/files.js'
export function tutorSubjects(folders:Pick<PlannerFolder,'id'|'parentId'|'name'>[]){
 const roots=new Set(folders.filter(f=>!f.parentId&&f.name.trim().toLowerCase()==='subjects').map(f=>f.id))
 return folders.filter(f=>f.parentId&&roots.has(f.parentId)).sort((a,b)=>a.name.localeCompare(b.name))
}
export async function syncTutorChats(username:string,activate=false){
 if(activate)storage(await db().from('planner_vm_settings').upsert({username,tutor_enabled:true},{onConflict:'username'}))
 else{const settings=storage(await db().from('planner_vm_settings').select('tutor_enabled').eq('username',username).maybeSingle());if(!settings?.tutor_enabled)return {enabled:false,count:0}}
 const result=storage(await db().rpc('planner_sync_tutor_chats',{p_username:username}))
 return result as {enabled:boolean;count:number;changed?:number;archived?:number;deferred?:number;warning?:string}
}
