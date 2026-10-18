import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'

export async function readNoteHistory(username:string,args:{noteId:string;before?:number;versionId?:number;offset?:number}){
 if(args.versionId){
  const row=storage(await db().from('planner_note_history').select('*').eq('username',username).eq('note_id',args.noteId).eq('id',args.versionId).maybeSingle())
  if(!row)throw new ApiError(404,'History version not found.')
  const offset=args.offset||0,limit=20000
  const snapshot=(value:any)=>value?{...value,content:value.content?.slice(offset,offset+limit),richText:undefined,richTextSource:undefined}:null
  return {...row,before:snapshot(row.before),after:snapshot(row.after),offset,hasMore:Math.max(row.before?.content?.length||0,row.after?.content?.length||0)>offset+limit}
 }
 let query=db().from('planner_note_history').select('id,note_id,name,kind,changed_fields,created_at,files_revision').eq('username',username).eq('note_id',args.noteId).order('id',{ascending:false}).limit(21)
 if(args.before)query=query.lt('id',args.before)
 const rows=storage(await query)
 return {versions:rows.slice(0,20),hasMore:rows.length>20,nextBefore:rows.length>20?rows[19].id:null}
}
