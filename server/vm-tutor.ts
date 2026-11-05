import {z} from 'zod'
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
 const [files,rows]=await Promise.all([
  db().from('planner_files').select('folders:state->folders').eq('username',username).maybeSingle(),
  db().from('planner_vm_chats').select('id,title,tutor_subject_id,archived,deleted_at').eq('username',username).not('tutor_subject_id','is',null)
 ])
 const subjects=tutorSubjects(z.array(z.object({id:z.string(),parentId:z.string().nullable(),name:z.string()})).parse(storage(files)?.folders||[])),existing=storage(rows),bySubject=new Map(existing.map(c=>[c.tutor_subject_id,c]))
 const missing=subjects.filter(f=>!bySubject.has(f.id))
 if(missing.length)storage(await db().from('planner_vm_chats').upsert(missing.map(f=>({username,title:f.name.slice(0,100),tutor_subject_id:f.id})),{onConflict:'username,tutor_subject_id',ignoreDuplicates:true}))
 for(const folder of subjects){const row=bySubject.get(folder.id);if(row&&!row.deleted_at&&row.title!==folder.name.slice(0,100))storage(await db().from('planner_vm_chats').update({title:folder.name.slice(0,100)}).eq('username',username).eq('id',row.id))}
 return {enabled:true,count:subjects.length}
}
