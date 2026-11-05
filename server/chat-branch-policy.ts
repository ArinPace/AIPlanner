import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {canBranchChat} from '../src/lib/chatBranching.js'
export async function assertBranchableJob(username:string,jobId:string){
 const job=storage(await db().from('planner_vm_jobs').select('chat_id').eq('username',username).eq('id',jobId).maybeSingle())
 if(!job)throw new ApiError(404,'Message not found.')
 const chat=storage(await db().from('planner_vm_chats').select('is_main,tutor_subject_id').eq('username',username).eq('id',job.chat_id).maybeSingle())
 if(!chat)throw new ApiError(404,'Chat not found.')
 if(!canBranchChat(chat))throw new ApiError(400,'Branching is disabled for Main Chat and Tutor chats.')
}
